package in.minnal.core.profile.application;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.core.support.PostgresIntegrationTest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class OutboxRelayIntegrationTest extends PostgresIntegrationTest {

    /** A clock the test moves by hand. */
    static final class TestClock extends Clock {
        Instant now = Instant.parse("2026-11-19T10:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Autowired
    OutboxRepository outbox;

    @Test
    void aFailedPublishIsRetriedWithBackoffThenDeliveredInOrderExactlyOnce() {
        TestClock clock = new TestClock();
        outbox.add("minnal.user.profileUpdated", "{\"n\":1}", clock.now);
        outbox.add("minnal.user.profileUpdated", "{\"n\":2}", clock.now);
        List<String> delivered = new ArrayList<>();
        int[] calls = {0};
        OutboxRelay relay = new OutboxRelay(outbox, (stream, payload) -> {
            calls[0]++;
            if (calls[0] == 1) {
                throw new IllegalStateException("valkey down");
            }
            delivered.add(payload.replace(" ", ""));
        }, clock);

        assertThat(relay.publishPending()).isZero(); // the first publish fails
        assertThat(jdbc.sql("SELECT attempts FROM event_outbox ORDER BY id LIMIT 1").query(Integer.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM event_outbox WHERE published_at IS NOT NULL").query(Long.class).single()).isZero();

        assertThat(relay.publishPending()).isZero(); // still backing off: the publisher is not called again
        assertThat(calls[0]).isEqualTo(1);

        clock.now = clock.now.plus(Duration.ofSeconds(3));
        assertThat(relay.publishPending()).isEqualTo(2);
        assertThat(delivered).containsExactly("{\"n\":1}", "{\"n\":2}");
        assertThat(jdbc.sql("SELECT count(*) FROM event_outbox WHERE published_at IS NULL").query(Long.class).single()).isZero();

        assertThat(relay.publishPending()).isZero(); // nothing is delivered twice
        assertThat(delivered).hasSize(2);
    }

    @Test
    void aCrashAfterCommitStillDeliversBecauseTheRowIsOnlyMarkedAfterAPublish() {
        TestClock clock = new TestClock();
        outbox.add("minnal.user.profileUpdated", "{\"n\":1}", clock.now);
        // The "crashed" relay never reached markPublished: the row is still unpublished for the next one.
        assertThat(outbox.oldestUnpublished()).isPresent();
        List<String> delivered = new ArrayList<>();
        assertThat(new OutboxRelay(outbox, (s, p) -> delivered.add(p), clock).publishPending()).isEqualTo(1);
        assertThat(delivered).hasSize(1);
    }

    @Test
    void backoffGrowsAndIsCappedAtThirtySeconds() {
        assertThat(OutboxRelay.backoff(1)).isEqualTo(Duration.ofSeconds(2));
        assertThat(OutboxRelay.backoff(3)).isEqualTo(Duration.ofSeconds(8));
        assertThat(OutboxRelay.backoff(5)).isEqualTo(Duration.ofSeconds(30));
        assertThat(OutboxRelay.backoff(40)).isEqualTo(Duration.ofSeconds(30));
    }
}
