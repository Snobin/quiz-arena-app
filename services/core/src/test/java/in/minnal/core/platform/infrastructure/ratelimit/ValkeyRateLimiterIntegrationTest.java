package in.minnal.core.platform.infrastructure.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;

/** The Lua token bucket against a real Valkey (Testcontainers; needs Docker). */
class ValkeyRateLimiterIntegrationTest {

    static final GenericContainer<?> VALKEY = new GenericContainer<>("valkey/valkey:8-alpine").withExposedPorts(6379);
    static LettuceConnectionFactory factory;
    static StringRedisTemplate redis;
    static ValkeyRateLimiter limiter;

    @BeforeAll
    static void start() {
        VALKEY.start();
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(VALKEY.getHost(), VALKEY.getMappedPort(6379)));
        factory.afterPropertiesSet();
        redis = new StringRedisTemplate(factory);
        redis.afterPropertiesSet();
        limiter = new ValkeyRateLimiter(redis, "core:");
    }

    @AfterAll
    static void stop() {
        factory.destroy();
        VALKEY.stop();
    }

    @Test
    void exhaustsAtCapacityAndReportsRetryAfter() {
        RateLimitPolicy policy = new RateLimitPolicy("exhaust", 3, 3, Duration.ofHours(1));
        for (int i = 0; i < 3; i++) {
            assertThat(limiter.tryAcquire(policy, "anju").allowed()).isTrue();
        }
        RateLimiter.Decision refused = limiter.tryAcquire(policy, "anju");
        assertThat(refused.allowed()).isFalse();
        assertThat(refused.retryAfterSeconds()).isBetween(1L, 1200L);
    }

    @Test
    void refillsAtTheConfiguredRate() throws InterruptedException {
        RateLimitPolicy policy = new RateLimitPolicy("refill", 2, 1, Duration.ofSeconds(1));
        assertThat(limiter.tryAcquire(policy, "anju").allowed()).isTrue();
        assertThat(limiter.tryAcquire(policy, "anju").allowed()).isTrue();
        assertThat(limiter.tryAcquire(policy, "anju").allowed()).isFalse();
        Thread.sleep(1200);
        assertThat(limiter.tryAcquire(policy, "anju").allowed()).isTrue();
        assertThat(limiter.tryAcquire(policy, "anju").allowed()).isFalse();
    }

    @Test
    void usersHaveSeparateBucketsUnderTheCorePrefix() {
        RateLimitPolicy policy = new RateLimitPolicy("isolation", 1, 1, Duration.ofHours(1));
        assertThat(limiter.tryAcquire(policy, "anju").allowed()).isTrue();
        assertThat(limiter.tryAcquire(policy, "anju").allowed()).isFalse();
        assertThat(limiter.tryAcquire(policy, "biju").allowed()).isTrue();
        assertThat(redis.hasKey("core:rl:isolation:anju")).isTrue();
        assertThat(redis.hasKey("core:rl:isolation:biju")).isTrue();
        assertThat(redis.getExpire("core:rl:isolation:anju")).isPositive();
    }

    @Test
    void concurrentRequestsNeverOverspendTheBucket() throws Exception {
        RateLimitPolicy policy = new RateLimitPolicy("race", 5, 1, Duration.ofHours(1));
        var pool = java.util.concurrent.Executors.newFixedThreadPool(8);
        try {
            var futures = new java.util.ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 40; i++) {
                futures.add(pool.submit(() -> limiter.tryAcquire(policy, "anju").allowed()));
            }
            int allowed = 0;
            for (var f : futures) {
                if (f.get()) {
                    allowed++;
                }
            }
            assertThat(allowed).isEqualTo(5);
        } finally {
            pool.shutdown();
        }
    }
}
