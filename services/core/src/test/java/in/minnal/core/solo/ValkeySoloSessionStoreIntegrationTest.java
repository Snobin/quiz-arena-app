package in.minnal.core.solo;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.core.solo.application.SoloSession;
import in.minnal.core.solo.application.SoloSessionStore.Versioned;
import in.minnal.core.solo.infrastructure.ValkeySoloSessionStore;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import tools.jackson.databind.json.JsonMapper;

/** The Solo Practice store against a real Valkey (Testcontainers; needs Docker): keys, TTL, compare-and-set. */
class ValkeySoloSessionStoreIntegrationTest {

    static final GenericContainer<?> VALKEY = new GenericContainer<>("valkey/valkey:8-alpine").withExposedPorts(6379);
    static LettuceConnectionFactory factory;
    static StringRedisTemplate redis;
    static ValkeySoloSessionStore store;

    @BeforeAll
    static void start() {
        try {
            VALKEY.start();
        } catch (RuntimeException staleDockerConnection) {
            // After a long Spring test run the pooled Docker connection can be dead ("Broken pipe"); one retry opens a new one.
            VALKEY.start();
        }
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(VALKEY.getHost(), VALKEY.getMappedPort(6379)));
        factory.afterPropertiesSet();
        redis = new StringRedisTemplate(factory);
        redis.afterPropertiesSet();
        store = new ValkeySoloSessionStore(redis, JsonMapper.builder().build(), "core:");
    }

    @AfterAll
    static void stop() {
        factory.destroy();
        VALKEY.stop();
    }

    static SoloSession session(UUID user) {
        return new SoloSession(UUID.randomUUID(), user, new SoloSession.Source("BANK", UUID.randomUUID()), 1,
                List.of(UUID.randomUUID(), UUID.randomUUID()), 1, new SoloSession.Current(UUID.randomUUID(), 1, false, false), 0, 0);
    }

    @Test
    void storesUnderSoloKeysWithATwoHourTtlAndOnlyOneActiveSessionPerPlayer() {
        UUID user = UUID.randomUUID();
        SoloSession first = session(user);
        store.create(first);
        assertThat(redis.opsForValue().get("core:solo:user:" + user)).isEqualTo(first.sessionId().toString());
        assertThat(redis.getExpire("core:solo:s:" + first.sessionId())).isBetween(7000L, 7200L);
        assertThat(store.find(first.sessionId()).map(Versioned::session)).contains(first);
        SoloSession second = session(user);
        store.create(second);
        assertThat(store.find(first.sessionId())).isEmpty();
        assertThat(redis.keys("core:*")).allSatisfy(k -> assertThat(k).startsWith("core:solo:").doesNotContain("board"));
    }

    @Test
    void replaceSucceedsOnceAndDeleteRemovesBothKeys() {
        UUID user = UUID.randomUUID();
        SoloSession s = session(user);
        store.create(s);
        Versioned v1 = store.find(s.sessionId()).orElseThrow();
        assertThat(v1.revision()).isEqualTo(1);
        SoloSession answered = s.withAnswer(true);
        assertThat(store.replace(v1, answered)).isTrue();
        assertThat(store.replace(v1, answered)).as("a double tap loses the compare-and-set").isFalse();
        Versioned v2 = store.find(s.sessionId()).orElseThrow();
        assertThat(v2.session()).isEqualTo(answered);
        assertThat(v2.revision()).isEqualTo(2);
        store.delete(answered);
        assertThat(store.find(s.sessionId())).isEmpty();
        assertThat(redis.hasKey("core:solo:user:" + user)).isFalse();
    }

    @Test
    void theCompareAndSetDoesNotDependOnHowTheStoredJsonIsFormatted() {
        UUID user = UUID.randomUUID();
        SoloSession s = session(user);
        store.create(s);
        // As if an older release (or a changed record) had written the same session with different whitespace and key order.
        String pretty = JsonMapper.builder().build().writerWithDefaultPrettyPrinter().writeValueAsString(s);
        redis.opsForHash().put("core:solo:s:" + s.sessionId(), "data", pretty);
        Versioned stored = store.find(s.sessionId()).orElseThrow();
        assertThat(store.replace(stored, s.withAnswer(false))).isTrue();
    }

    @Test
    void concurrentStartsByOnePlayerLeaveExactlyOneSessionAndAMatchingPointer() throws Exception {
        UUID user = UUID.randomUUID();
        int starts = 24;
        ExecutorService pool = Executors.newFixedThreadPool(8);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<SoloSession>> futures = new ArrayList<>();
        for (int i = 0; i < starts; i++) {
            futures.add(pool.submit(() -> {
                SoloSession s = session(user);
                go.await();
                store.create(s);
                return s;
            }));
        }
        go.countDown();
        List<UUID> ids = new ArrayList<>();
        for (Future<SoloSession> f : futures) {
            ids.add(f.get().sessionId());
        }
        pool.shutdown();
        String pointer = redis.opsForValue().get("core:solo:user:" + user);
        assertThat(ids.stream().map(UUID::toString)).contains(pointer);
        long alive = ids.stream().filter(id -> redis.hasKey("core:solo:s:" + id)).count();
        assertThat(alive).as("no orphaned sessions are left behind").isEqualTo(1);
        assertThat(redis.hasKey("core:solo:s:" + pointer)).isTrue();
    }
}
