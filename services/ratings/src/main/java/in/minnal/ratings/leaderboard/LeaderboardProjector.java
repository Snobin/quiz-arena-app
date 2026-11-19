package in.minnal.ratings.leaderboard;

import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import in.minnal.ratings.leaderboard.PeriodKeys.Window;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * Projects one rated user's boards from Postgres (AD-16, AD-17). Every value is absolute and recomputed, never
 * incremented: the all-time score is her current rating, and the daily and weekly scores are the sum of her
 * {@code rating_event} deltas whose {@code ended_at} falls in the IST day and Monday-start IST week of
 * {@code ratedAt}. So a retried or duplicated projection gives the same board. A tombstoned player is never written.
 */
@Service
public class LeaderboardProjector {

    private final JdbcClient jdbc;
    private final LeaderboardStore store;
    private final Boards boards;
    private final Clock clock;

    public LeaderboardProjector(JdbcClient jdbc, LeaderboardStore store, Boards boards, Clock clock) {
        this.jdbc = jdbc;
        this.store = store;
        this.boards = boards;
        this.clock = clock;
    }

    public void project(UUID userId, String mode, Instant ratedAt) {
        boolean tombstoned = jdbc.sql("SELECT EXISTS (SELECT 1 FROM player_directory WHERE user_id = :u AND tombstoned_at IS NOT NULL)")
                .param("u", userId).query(Boolean.class).single();
        if (tombstoned) {
            return;
        }
        jdbc.sql("SELECT rating FROM rating WHERE user_id = :u AND mode = :m").param("u", userId).param("m", mode)
                .query(Integer.class).optional()
                .ifPresent(rating -> store.set(boards.key(mode, Period.ALLTIME, ratedAt), userId.toString(), rating, null));
        for (Period period : new Period[] {Period.DAILY, Period.WEEKLY}) {
            Window window = PeriodKeys.window(period, ratedAt);
            // A backlogged row older than the period's retention is not brought back to life with a fresh expiry.
            if (window.to().plus(period.retention()).isBefore(clock.instant())) {
                continue;
            }
            // A position needs a rated match in the period: the sum is only written when there is an event.
            jdbc.sql("""
                    SELECT SUM(delta) FROM rating_event
                    WHERE user_id = :u AND mode = :m AND ended_at >= :from AND ended_at < :to
                    HAVING count(*) > 0
                    """)
                    .param("u", userId).param("m", mode).param("from", Timestamp.from(window.from())).param("to", Timestamp.from(window.to()))
                    .query(Long.class).optional()
                    .ifPresent(sum -> store.set(boards.key(mode, period, ratedAt), userId.toString(), sum, period.retention()));
        }
    }
}
