package in.minnal.ratings.leaderboard;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.ratings.ingest.FakeStreamClient;
import in.minnal.ratings.ingest.MatchCompletedHandler;
import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import in.minnal.ratings.outbox.OutboxRelay;
import in.minnal.ratings.outbox.OutboxRepository;
import in.minnal.ratings.support.PostgresIntegrationTest;
import in.minnal.ratings.support.TestClock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import tools.jackson.databind.json.JsonMapper;

/** Valkey losing its board keys is recoverable from Postgres alone (NFR9): flush, rebuild, identical boards. Real Valkey (needs Docker). */
class LeaderboardRebuildIntegrationTest extends PostgresIntegrationTest {

    static final GenericContainer<?> VALKEY = in.minnal.ratings.support.SharedValkey.VALKEY;
    static LettuceConnectionFactory factory;
    static StringRedisTemplate redis;
    static ValkeyLeaderboardStore store;

    static final Instant NOW = Instant.parse("2026-11-19T10:00:00Z");

    @Autowired
    MatchCompletedHandler handler;

    @Autowired
    OutboxRepository outbox;

    @Autowired
    JsonMapper json;

    @Autowired
    Boards boards;

    @BeforeAll
    static void start() {
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(VALKEY.getHost(), VALKEY.getMappedPort(6379)));
        factory.afterPropertiesSet();
        redis = new StringRedisTemplate(factory);
        redis.afterPropertiesSet();
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("redis", redis);
        store = new ValkeyLeaderboardStore(beans.getBeanProvider(StringRedisTemplate.class));
    }

    @AfterAll
    static void stop() {
        if (factory != null) {
            factory.destroy();
        }
    }

    static void flush() {
        try (var connection = factory.getConnection()) {
            connection.serverCommands().flushAll();
        }
    }

    LeaderboardRebuild rebuild() {
        return new LeaderboardRebuild(jdbc, store, boards, new TestClock(NOW));
    }

    OutboxRelay liveRelay() {
        LeaderboardProjector projector = new LeaderboardProjector(jdbc, store, boards, new TestClock(NOW));
        return new OutboxRelay(outbox, new FakeStreamClient(), new TestClock(NOW), entry -> {
            var event = json.readTree(entry.payload());
            projector.project(UUID.fromString(event.get("userId").asString()), event.get("mode").asString(), Instant.parse(event.get("ratedAt").asString()));
        });
    }

    MatchCompletedEvent match(Instant endedAt, QuestionSource source, List<CompletedParticipant> participants) {
        return MatchCompletedEvent.of(UUID.randomUUID(), MatchMode.QUICK, null, source, endedAt.minusSeconds(180), endedAt, null, participants);
    }

    /** Every board key under the ratings prefix and its members with scores. */
    Map<String, Map<String, Double>> dump() {
        Map<String, Map<String, Double>> out = new LinkedHashMap<>();
        Set<String> keys = redis.keys("ratings:lb:*");
        for (String key : keys == null ? Set.<String>of() : keys) {
            if (key.contains("meta")) {
                continue;
            }
            Map<String, Double> board = new LinkedHashMap<>();
            for (LeaderboardStore.Row row : store.top(key, 0, 1000)) {
                board.put(row.member(), row.score());
            }
            out.put(key, board);
        }
        return out;
    }

    @Test
    void aFlushedValkeyRebuiltFromPostgresGivesIdenticalBoardsAndSkipsTombstonedPlayers() {
        flush();
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID c = UUID.randomUUID();
        UUID gone = UUID.randomUUID();
        handler.handle(match(NOW.minusSeconds(3600), QuestionSource.BANK, List.of(user(a, 7000, 1), user(b, 4000, 2), guest(1, 3))));
        handler.handle(match(NOW.minusSeconds(1800), QuestionSource.BANK, List.of(user(a, 100, 2), user(c, 900, 1))));
        handler.handle(match(NOW.minusSeconds(900), QuestionSource.BANK, List.of(user(b, 500, 1), user(c, 500, 1))));         // a draw: both 0 net on that match
        handler.handle(match(NOW.minusSeconds(60), QuestionSource.CUSTOM, List.of(user(a, 999, 1), guest(1, 2))));            // unrated
        handler.handle(match(NOW.minus(java.time.Duration.ofDays(3)), QuestionSource.BANK, List.of(user(c, 700, 1), guest(1, 2)))); // an earlier day, same week
        liveRelay().publishPending();
        // A player who is tombstoned afterwards: the rebuild must not include her, and the live boards still do.
        handler.handle(match(NOW.minusSeconds(30), QuestionSource.BANK, List.of(user(gone, 700, 1), guest(1, 2))));
        liveRelay().publishPending();
        jdbc.sql("INSERT INTO player_directory (user_id, display_name, district, exam_level, language, updated_at, tombstoned_at) VALUES (:u, 'g', 'thrissur', 'DEGREE', 'ml', now(), now())")
                .param("u", gone).update();

        Map<String, Map<String, Double>> live = dump();
        assertThat(live.keySet()).anyMatch(k -> k.contains(":all"));
        assertThat(live.get(boards.key("QUICK", Period.ALLTIME, NOW))).containsKey(gone.toString());

        flush(); // Valkey loses everything
        assertThat(store.hasMarker(boards.builtAtKey())).isFalse();
        rebuild().rebuildAll();
        Map<String, Map<String, Double>> rebuilt = dump();

        // Identical to the live boards, except that the tombstoned player is skipped.
        // Only the current boards are rebuilt (today, this week, all-time); a board of an earlier, still-retained day is not.
        Set<String> current = Set.of(boards.key("QUICK", Period.DAILY, NOW), boards.key("QUICK", Period.WEEKLY, NOW), boards.key("QUICK", Period.ALLTIME, NOW));
        live.keySet().retainAll(current);
        live.values().forEach(board -> board.remove(gone.toString()));
        live.values().removeIf(Map::isEmpty);
        assertThat(rebuilt).isEqualTo(live);
        assertThat(store.hasMarker(boards.builtAtKey())).isTrue();
        // Today's board holds only today's rated matches; the daily keys expire after 8 days, the weekly after 5 weeks.
        Map<String, Double> today = rebuilt.get(boards.key("QUICK", Period.DAILY, NOW));
        assertThat(today).containsOnlyKeys(a.toString(), b.toString(), c.toString());
        assertThat(redis.getExpire(boards.key("QUICK", Period.DAILY, NOW))).isBetween(7L * 86400, 8L * 86400);
        assertThat(redis.getExpire(boards.key("QUICK", Period.WEEKLY, NOW))).isBetween(34L * 86400, 35L * 86400);
        assertThat(redis.getExpire(boards.key("QUICK", Period.ALLTIME, NOW))).isEqualTo(-1L);
    }

    @Test
    void theBootRunnerRebuildsOnlyWhenTheMarkerIsMissing() {
        flush();
        UUID a = UUID.randomUUID();
        handler.handle(match(NOW.minusSeconds(60), QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));
        int[] exits = {-1};
        LeaderboardRunner runner = new LeaderboardRunner(rebuild(), store, boards, true, code -> exits[0] = code);
        ApplicationArguments none = new DefaultApplicationArguments();

        runner.run(none); // marker missing after a flush: rebuilds
        assertThat(store.hasMarker(boards.builtAtKey())).isTrue();
        assertThat(store.top(boards.key("QUICK", Period.ALLTIME, NOW), 0, 10)).hasSize(1);

        redis.delete(boards.key("QUICK", Period.ALLTIME, NOW));
        runner.run(none); // marker present: nothing is rebuilt
        assertThat(store.top(boards.key("QUICK", Period.ALLTIME, NOW), 0, 10)).isEmpty();
        assertThat(exits[0]).isEqualTo(-1); // a normal boot never exits
    }

    @Test
    void theRebuildOptionRebuildsThenExitsWith0AndWith1WhenItFailsEvenWithTheStreamLoopsOff() {
        flush();
        UUID a = UUID.randomUUID();
        handler.handle(match(NOW.minusSeconds(60), QuestionSource.BANK, List.of(user(a, 7000, 1), guest(1, 2))));
        int[] exits = {-1};
        ApplicationArguments option = new DefaultApplicationArguments("--" + LeaderboardRunner.OPTION);

        new LeaderboardRunner(rebuild(), store, boards, false, code -> exits[0] = code).run(option);
        assertThat(exits[0]).isZero();
        assertThat(store.hasMarker(boards.builtAtKey())).isTrue();
        assertThat(store.top(boards.key("QUICK", Period.ALLTIME, NOW), 0, 10)).hasSize(1);

        LeaderboardRebuild failing = new LeaderboardRebuild(jdbc, store, boards, new TestClock(NOW)) {
            @Override
            public int rebuildAll() {
                throw new IllegalStateException("postgres down");
            }
        };
        new LeaderboardRunner(failing, store, boards, false, code -> exits[0] = code).run(option);
        assertThat(exits[0]).isEqualTo(1);
    }
}
