package in.minnal.ratings.outbox;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.ratings.ingest.FakeStreamClient;
import in.minnal.ratings.support.PostgresIntegrationTest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class OutboxRelayIntegrationTest extends PostgresIntegrationTest {

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
        outbox.add("minnal.rating.updated", "{\"n\":1}", clock.now);
        outbox.add("minnal.rating.updated", "{\"n\":2}", clock.now);
        FakeStreamClient streams = new FakeStreamClient();
        streams.failCappedAdds = 1;
        OutboxRelay relay = new OutboxRelay(outbox, streams, clock);

        assertThat(relay.publishPending()).isZero();
        assertThat(jdbc.sql("SELECT attempts FROM event_outbox ORDER BY id LIMIT 1").query(Integer.class).single()).isEqualTo(1);
        assertThat(relay.publishPending()).isZero(); // still backing off

        clock.now = clock.now.plus(Duration.ofSeconds(3));
        assertThat(relay.publishPending()).isEqualTo(2);
        assertThat(streams.entries("minnal.rating.updated")).extracting(e -> e.fields().get("payload").replace(" ", "")).containsExactly("{\"n\":1}", "{\"n\":2}");
        assertThat(jdbc.sql("SELECT count(*) FROM event_outbox WHERE published_at IS NULL").query(Long.class).single()).isZero();
        assertThat(relay.publishPending()).isZero();
        assertThat(streams.entries("minnal.rating.updated")).hasSize(2);
    }

    @Test
    void backoffGrowsAndIsCappedAtThirtySeconds() {
        assertThat(OutboxRelay.backoff(1)).isEqualTo(Duration.ofSeconds(2));
        assertThat(OutboxRelay.backoff(4)).isEqualTo(Duration.ofSeconds(16));
        assertThat(OutboxRelay.backoff(5)).isEqualTo(Duration.ofSeconds(30));
        assertThat(OutboxRelay.backoff(50)).isEqualTo(Duration.ofSeconds(30));
    }
}
