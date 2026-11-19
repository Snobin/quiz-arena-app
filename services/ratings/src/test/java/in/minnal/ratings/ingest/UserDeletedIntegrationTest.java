package in.minnal.ratings.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.events.UserDeletedEvent;
import in.minnal.ratings.directory.PlayerDirectory;
import in.minnal.ratings.leaderboard.Boards;
import in.minnal.ratings.leaderboard.FakeLeaderboardStore;
import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import in.minnal.ratings.platform.infrastructure.security.TestJwks;
import in.minnal.ratings.support.PostgresIntegrationTest;
import in.minnal.ratings.support.TestClock;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/** Story 2.8 ratings side: tombstone, board removal, replay, no rating for a deleted player, 401 on /me. */
@AutoConfigureMockMvc
@Import(UserDeletedIntegrationTest.Fakes.class)
class UserDeletedIntegrationTest extends PostgresIntegrationTest {

    static final Instant NOW = Instant.parse("2026-11-19T10:00:00Z");
    static final TestJwks JWKS = TestJwks.start();

    @TestConfiguration
    static class Fakes {
        @Bean
        @Primary
        FakeLeaderboardStore fakeLeaderboardStore() {
            return new FakeLeaderboardStore();
        }

        @Bean
        @Primary
        TestClock testClock() {
            return new TestClock(NOW);
        }
    }

    @DynamicPropertySource
    static void jwks(DynamicPropertyRegistry registry) {
        registry.add("minnal.security.jwks-uri", JWKS::uri);
    }

    @AfterAll
    static void stop() {
        JWKS.close();
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    FakeLeaderboardStore store;

    @Autowired
    Boards boards;

    @Autowired
    UserDeletedHandler handler;

    @Autowired
    MatchCompletedHandler matches;

    @Autowired
    PlayerDirectory directory;

    @Autowired
    JsonMapper json;

    UserDeletedEvent deleted(UUID user) {
        return new UserDeletedEvent(UUID.randomUUID(), user, NOW);
    }

    @Test
    void aDeletionCreatesTheTombstoneRemovesHerFromEveryBoardAndAReplayChangesNothing() {
        UUID gone = UUID.randomUUID();
        UUID stays = UUID.randomUUID();
        for (String mode : List.of("QUICK", "TOPIC_DUEL", "BATTLE_ROOM")) {
            for (Period period : Period.values()) {
                store.set(boards.key(mode, period, NOW), gone.toString(), 40, null);
                store.set(boards.key(mode, period, NOW), stays.toString(), 30, null);
            }
        }
        UserDeletedEvent event = deleted(gone);

        handler.handle(event);
        handler.handle(event);

        assertThat(count("player_directory")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT tombstoned_at IS NOT NULL FROM player_directory WHERE user_id = :u").param("u", gone).query(Boolean.class).single()).isTrue();
        assertThat(store.boards).hasSize(9);
        store.boards.values().forEach(board -> assertThat(board).containsOnlyKeys(stays.toString()));
    }

    @Test
    void aProfileUpdatedLaterNeverClearsTheTombstoneOrTheNameThatWasThere() {
        UUID user = UUID.randomUUID();
        directory.apply(StreamConsumerIntegrationTest.profile(user, "Anju", "2026-11-19T09:00:00Z"));
        handler.handle(deleted(user));
        directory.apply(StreamConsumerIntegrationTest.profile(user, "Back", "2026-11-19T11:00:00Z"));
        assertThat(jdbc.sql("SELECT display_name FROM player_directory WHERE user_id = :u").param("u", user).query(String.class).single()).isEqualTo("Anju");
        assertThat(jdbc.sql("SELECT tombstoned_at IS NOT NULL FROM player_directory WHERE user_id = :u").param("u", user).query(Boolean.class).single()).isTrue();
    }

    @Test
    void aRatedMatchNamingADeletedPlayerWritesNothingForHerAndStillRatesTheOpponent() {
        UUID gone = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        handler.handle(deleted(gone));

        matches.handle(rated(UUID.randomUUID(), List.of(user(gone, 7000, 1), user(other, 4000, 2))));

        assertThat(count("rating")).isEqualTo(1);
        assertThat(count("match_record")).isEqualTo(1);
        assertThat(count("rating_event")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT user_id FROM match_record").query(UUID.class).single()).isEqualTo(other);
        assertThat(count("event_outbox")).isEqualTo(1);
    }

    @Test
    void anUnratedMatchNamingADeletedPlayerWritesNoHistoryForHer() {
        UUID gone = UUID.randomUUID();
        handler.handle(deleted(gone));
        matches.handle(MatchCompletedEvent.of(UUID.randomUUID(), in.minnal.contracts.realtime.MatchMode.QUICK, null,
                in.minnal.contracts.internal.QuestionSource.CUSTOM, NOW.minusSeconds(60), NOW, null, List.of(user(gone, 1, 1), guest(0, 2))));
        assertThat(count("match_record")).isZero();
    }

    @Test
    void theConsumerHandlesTheStreamEntryAndAcknowledgesIt() {
        FakeStreamClient streams = new FakeStreamClient();
        UUID gone = UUID.randomUUID();
        streams.append(UserDeletedEvent.STREAM, Map.of("payload", json.writeValueAsString(deleted(gone))));
        StreamConsumer consumer = new StreamConsumer(streams, matches, directory, handler, json, new SimpleMeterRegistry(), "c1", Duration.ZERO);

        assertThat(consumer.poll()).isEqualTo(1);

        assertThat(count("player_directory")).isEqualTo(1);
        assertThat(streams.pendingOf(UserDeletedEvent.STREAM, StreamConsumer.GROUP)).isEmpty();
    }

    @Test
    void theMeEndpointsAnswer401ForADeletedPlayerAndStayOpenForOthers() throws Exception {
        UUID gone = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        handler.handle(deleted(gone));
        for (String path : List.of("/api/ratings/v1/me/ratings", "/api/ratings/v1/me/matches", "/api/ratings/v1/matches/" + UUID.randomUUID())) {
            mvc.perform(get(path).header("Authorization", bearer(gone))).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/ratings/v1/me/ratings").header("Authorization", bearer(other))).andExpect(status().isOk());
    }

    static String bearer(UUID user) {
        return "Bearer " + JWKS.token(c -> c.subject(user.toString()).claim("roles", List.of("USER")));
    }
}
