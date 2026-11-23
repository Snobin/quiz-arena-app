package in.minnal.ratings.metrics;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.ratings.support.PostgresIntegrationTest;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Story 7.3b-ii: the cohort and the share, against a real Postgres. */
class ReturnRateJobIntegrationTest extends PostgresIntegrationTest {

    @Autowired ReturnRateJob job;
    @Autowired MeterRegistry meters;

    private void match(UUID user, String endedAtUtc) {
        jdbc.sql("""
                INSERT INTO match_record (match_id, user_id, mode, placement, result, score, correct_count, forfeited, rated, rating_delta, ended_at)
                VALUES (:m, :u, 'QUICK', 1, 'WIN', 100, 5, false, true, 8, :t)
                """).param("m", UUID.randomUUID()).param("u", user).param("t", java.sql.Timestamp.from(Instant.parse(endedAtUtc))).update();
    }

    private double gauge(String name) {
        return meters.get(name).gauge().value();
    }

    @Test
    void theCohortIsThePlayersWhoseFirstMatchWasOnIstDay8AgoAndTheShareIsWhoCameBack() {
        UUID returned = UUID.randomUUID();
        UUID sameDayOnly = UUID.randomUUID();
        UUID tooLate = UUID.randomUUID();
        UUID otherDay = UUID.randomUUID();
        UUID earlierFirst = UUID.randomUUID();
        // The cohort day is 2026-11-15 IST (job run on 2026-11-23). 04:30Z is 10:00 IST.
        match(returned, "2026-11-15T04:30:00Z");
        match(returned, "2026-11-18T04:30:00Z"); // a later IST day inside the window
        match(sameDayOnly, "2026-11-15T04:30:00Z");
        match(sameDayOnly, "2026-11-15T10:00:00Z"); // same IST day: not a return
        match(tooLate, "2026-11-15T17:30:00Z"); // 23:00 IST
        match(tooLate, "2026-11-22T18:00:00Z"); // after 7 x 24 h
        match(otherDay, "2026-11-14T04:30:00Z"); // first match on another day: not in the cohort
        match(earlierFirst, "2026-11-10T04:30:00Z");
        match(earlierFirst, "2026-11-15T04:30:00Z"); // first was earlier, so not in the cohort

        job.compute(LocalDate.of(2026, 11, 23));

        assertThat(gauge("minnal.retention.d7.cohort")).isEqualTo(3);
        assertThat(gauge("minnal.retention.d7.share")).isEqualTo(1.0 / 3);
    }

    @Test
    void anEmptyCohortPublishesNoShare() {
        job.compute(LocalDate.of(2026, 11, 23));
        assertThat(gauge("minnal.retention.d7.cohort")).isZero();
        assertThat(gauge("minnal.retention.d7.share")).isNaN();
    }

    @Test
    void theIstDayDecidesTheCohortNotTheUtcDay() {
        UUID late = UUID.randomUUID();
        // 2026-11-14T19:00Z is already 2026-11-15 00:30 IST, so this player is in the 2026-11-15 cohort.
        match(late, "2026-11-14T19:00:00Z");
        job.compute(LocalDate.of(2026, 11, 23));
        assertThat(gauge("minnal.retention.d7.cohort")).isEqualTo(1);
        assertThat(gauge("minnal.retention.d7.share")).isZero();
    }
}
