package in.minnal.ratings.leaderboard;

import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import in.minnal.ratings.leaderboard.PeriodKeys.Window;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Rebuilds every current board for all three modes from Postgres alone (NFR9): the all-time board from each rating,
 * today's and this week's boards from the sum of {@code rating_event} deltas in the period (anyone with a rated
 * match in it has a position, even at zero). Tombstoned players are skipped. Each board is built under a temporary
 * key and renamed over the live one, then the {@code builtAt} marker is set.
 */
@Service
public class LeaderboardRebuild {

    static final List<String> MODES = List.of("QUICK", "TOPIC_DUEL", "BATTLE_ROOM");
    private static final Logger log = LoggerFactory.getLogger(LeaderboardRebuild.class);

    private final JdbcClient jdbc;
    private final LeaderboardStore store;
    private final Boards boards;
    private final Clock clock;

    public LeaderboardRebuild(JdbcClient jdbc, LeaderboardStore store, Boards boards, Clock clock) {
        this.jdbc = jdbc;
        this.store = store;
        this.boards = boards;
        this.clock = clock;
    }

    /** Rebuilds all current boards; returns how many entries were written. */
    public int rebuildAll() {
        Instant now = clock.instant();
        int written = 0;
        for (String mode : MODES) {
            Map<String, Double> all = new LinkedHashMap<>();
            jdbc.sql("""
                    SELECT r.user_id, r.rating FROM rating r
                    WHERE r.mode = :m AND NOT EXISTS (SELECT 1 FROM player_directory d WHERE d.user_id = r.user_id AND d.tombstoned_at IS NOT NULL)
                    """)
                    .param("m", mode).query((rs, n) -> all.put(rs.getString(1), (double) rs.getInt(2))).list();
            store.replace(boards.key(mode, Period.ALLTIME, now), all, null);
            written += all.size();
            for (Period period : new Period[] {Period.DAILY, Period.WEEKLY}) {
                Window window = PeriodKeys.window(period, now);
                Map<String, Double> sums = new LinkedHashMap<>();
                jdbc.sql("""
                        SELECT e.user_id, SUM(e.delta) FROM rating_event e
                        WHERE e.mode = :m AND e.ended_at >= :from AND e.ended_at < :to
                          AND NOT EXISTS (SELECT 1 FROM player_directory d WHERE d.user_id = e.user_id AND d.tombstoned_at IS NOT NULL)
                        GROUP BY e.user_id
                        """)
                        .param("m", mode).param("from", Timestamp.from(window.from())).param("to", Timestamp.from(window.to()))
                        .query((rs, n) -> sums.put(rs.getString(1), (double) rs.getLong(2))).list();
                store.replace(boards.key(mode, period, now), sums, period.retention());
                written += sums.size();
            }
        }
        store.setMarker(boards.builtAtKey(), now.toString());
        log.info("leaderboards rebuilt from Postgres: {} entries", written);
        return written;
    }
}
