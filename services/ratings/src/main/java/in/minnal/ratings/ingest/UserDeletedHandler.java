package in.minnal.ratings.ingest;

import in.minnal.contracts.events.UserDeletedEvent;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.ratings.leaderboard.Boards;
import in.minnal.ratings.leaderboard.LeaderboardStore;
import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Applies one {@code minnal.user.deleted} (Story 2.8). In one transaction the player's directory row is
 * tombstoned (created with placeholders when missing; the earliest tombstone is kept and is never cleared).
 * After the commit she is removed from every current daily, weekly and all-time board in all modes. Replays are
 * no-ops; a failed board removal throws, so the entry stays pending and is retried (removal is idempotent).
 * {@code rating}, {@code rating_event} and {@code match_record} are kept: what DPDP requires beyond this is
 * an open question for Story 7.4.
 */
@Service
public class UserDeletedHandler {

    private static final Logger log = LoggerFactory.getLogger(UserDeletedHandler.class);

    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final LeaderboardStore store;
    private final Boards boards;
    private final Clock clock;

    public UserDeletedHandler(JdbcClient jdbc, TransactionTemplate tx, LeaderboardStore store, Boards boards, Clock clock) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.store = store;
        this.boards = boards;
        this.clock = clock;
    }

    public void handle(UserDeletedEvent event) {
        if (event.userId() == null || event.occurredAt() == null) {
            throw new IllegalArgumentException("user.deleted needs userId and occurredAt");
        }
        tx.executeWithoutResult(status -> jdbc.sql("""
                INSERT INTO player_directory (user_id, display_name, district, exam_level, language, updated_at, tombstoned_at)
                VALUES (:id, '', '', '', 'en', :at, :at)
                ON CONFLICT (user_id) DO UPDATE SET tombstoned_at = COALESCE(player_directory.tombstoned_at, EXCLUDED.tombstoned_at)
                """).param("id", event.userId()).param("at", Timestamp.from(event.occurredAt())).update());
        Set<String> keys = new LinkedHashSet<>();
        for (Instant at : new Instant[] {clock.instant(), event.occurredAt()}) {
            for (MatchMode mode : MatchMode.values()) {
                for (Period period : Period.values()) {
                    keys.add(boards.key(mode.name(), period, at));
                }
            }
        }
        store.remove(keys, event.userId().toString());
        log.info("user {} tombstoned and removed from {} boards", event.userId(), keys.size());
    }
}
