package in.minnal.ratings.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The 7-day return rate (Story 7.3b-ii). Every night at 03:00 IST it looks at the players whose first completed match fell on the
 * IST day 8 days ago, and publishes the cohort size and the share who completed another match on a later IST day within
 * 7 x 24 h of their first. Only registered players are in {@code match_record} (guests and bots are never stored, and an
 * aborted match is never recorded), so none of those count. The gauges keep the last value; a restart loses them until the next run.
 */
@Component
public class ReturnRateJob {

    private static final Logger log = LoggerFactory.getLogger(ReturnRateJob.class);
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private static final String SQL = """
            WITH first_match AS (
                SELECT user_id, MIN(ended_at) AS first_at
                FROM match_record
                GROUP BY user_id
                HAVING CAST(MIN(ended_at) AT TIME ZONE 'Asia/Kolkata' AS date) = CAST(:day AS date)
            )
            SELECT COUNT(*) AS cohort,
                   COUNT(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM match_record m
                       WHERE m.user_id = f.user_id
                         AND m.ended_at > f.first_at
                         AND m.ended_at < f.first_at + INTERVAL '7 days'
                         AND CAST(m.ended_at AT TIME ZONE 'Asia/Kolkata' AS date) > CAST(:day AS date)
                   )) AS returned
            FROM first_match f
            """;

    private final JdbcClient jdbc;
    private final Clock clock;
    private final AtomicReference<double[]> latest = new AtomicReference<>(new double[] {Double.NaN, Double.NaN});

    public ReturnRateJob(JdbcClient jdbc, Clock clock, MeterRegistry meters) {
        this.jdbc = jdbc;
        this.clock = clock;
        Gauge.builder("minnal.retention.d7.cohort", () -> latest.get()[0])
                .description("Players whose first completed match was 8 IST days ago").register(meters);
        Gauge.builder("minnal.retention.d7.share", () -> latest.get()[1])
                .description("Share of that cohort who completed another match on a later IST day within 7 x 24 h").register(meters);
    }

    @Scheduled(cron = "0 0 3 * * *", zone = "Asia/Kolkata")
    void nightly() {
        try {
            compute(LocalDate.now(clock.withZone(IST)));
        } catch (RuntimeException e) {
            log.atWarn().setCause(e).log("could not compute the 7-day return rate");
        }
    }

    /** Computes the cohort of the IST day 8 days before {@code today}. A cohort of zero publishes an empty share (NaN). */
    void compute(LocalDate today) {
        LocalDate day = today.minusDays(8);
        var row = jdbc.sql(SQL).param("day", day)
                .query((rs, n) -> new long[] {rs.getLong("cohort"), rs.getLong("returned")}).single();
        double cohort = row[0];
        latest.set(new double[] {cohort, cohort == 0 ? Double.NaN : row[1] / cohort});
        log.atInfo().addKeyValue("day", day).addKeyValue("cohort", row[0]).addKeyValue("returned", row[1])
                .log("7-day return computed");
    }
}
