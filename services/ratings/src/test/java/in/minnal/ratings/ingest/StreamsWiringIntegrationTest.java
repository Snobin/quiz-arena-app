package in.minnal.ratings.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.ratings.support.PostgresIntegrationTest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.json.JsonMapper;

/** With {@code minnal.streams.enabled=true} the scheduled loop consumes an entry and relays the outbox with no manual call. */
@TestPropertySource(properties = "minnal.streams.enabled=true")
@Import(StreamsWiringIntegrationTest.Fake.class)
class StreamsWiringIntegrationTest extends PostgresIntegrationTest {

    @TestConfiguration
    static class Fake {
        @Bean
        @Primary
        FakeStreamClient fakeStreamClient() {
            return new FakeStreamClient();
        }
    }

    @Autowired
    FakeStreamClient streams;

    @Autowired
    JsonMapper json;

    @Test
    void theScheduledLoopRatesAMatchAndPublishesRatingUpdatedOnItsOwn() throws Exception {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        streams.append(MatchCompletedEvent.STREAM,
                Map.of("payload", json.writeValueAsString(rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(b, 4000, 2))))));

        long deadline = System.nanoTime() + java.time.Duration.ofSeconds(20).toNanos();
        while (System.nanoTime() < deadline && streams.entries("minnal.rating.updated").size() < 2) {
            Thread.sleep(100);
        }

        assertThat(jdbc.sql("SELECT rating FROM rating WHERE user_id = :u").param("u", a).query(Integer.class).single()).isEqualTo(1216);
        assertThat(streams.entries("minnal.rating.updated")).hasSize(2);
        assertThat(streams.pendingOf(MatchCompletedEvent.STREAM, StreamConsumer.GROUP)).isEmpty();
    }
}
