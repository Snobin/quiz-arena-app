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

        // The relay projects the leaderboards before publishing; there is no Valkey here, so use the in-memory store.
        @Bean
        @Primary
        in.minnal.ratings.leaderboard.FakeLeaderboardStore fakeLeaderboardStore() {
            return new in.minnal.ratings.leaderboard.FakeLeaderboardStore();
        }
    }

    @Autowired
    FakeStreamClient streams;

    @Autowired
    in.minnal.ratings.leaderboard.FakeLeaderboardStore boardStore;

    @Autowired
    in.minnal.ratings.outbox.OutboxRepository outbox;

    @Autowired
    in.minnal.ratings.leaderboard.Boards boards;

    @Autowired
    JsonMapper json;

    /** The fake stream and board are shared by both tests (one Spring context): start each from empty. */
    @org.junit.jupiter.api.BeforeEach
    void resetFakes() {
        streams.streams.values().forEach(java.util.List::clear);
        streams.cursor.replaceAll((k, v) -> 0);
        streams.pending.clear();
        boardStore.boards.clear();
    }

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
        // The wired relay projected the boards before publishing: all-time holds both ratings.
        String allTime = boards.key("QUICK", in.minnal.ratings.leaderboard.PeriodKeys.Period.ALLTIME, java.time.Instant.now());
        assertThat(boardStore.boards.get(allTime)).containsEntry(a.toString(), 1216.0).containsEntry(b.toString(), 1184.0);
    }

    @Test
    void aMalformedRatingUpdatedRowIsPublishedAsIsAndDoesNotBlockTheRowsBehindIt() throws Exception {
        outbox.add("minnal.rating.updated", "{\"nothing\":\"useful\"}", java.time.Instant.parse("2026-11-19T10:00:00Z"));
        outbox.add("minnal.other", "{\"x\":1}", java.time.Instant.parse("2026-11-19T10:00:01Z"));

        long deadline = System.nanoTime() + java.time.Duration.ofSeconds(20).toNanos();
        while (System.nanoTime() < deadline && streams.entries("minnal.other").isEmpty()) {
            Thread.sleep(100);
        }
        assertThat(streams.entries("minnal.rating.updated")).hasSize(1);
        assertThat(streams.entries("minnal.other")).hasSize(1); // not projected, still published
        assertThat(boardStore.boards).isEmpty();
    }
}
