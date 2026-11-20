package in.minnal.core.platform.infrastructure.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class InMemoryRateLimiterTest {

    static final RateLimitPolicy POLICY = new RateLimitPolicy("test", 3, 3, Duration.ofHours(1));

    final AtomicLong now = new AtomicLong(1_000_000);
    final InMemoryRateLimiter limiter = new InMemoryRateLimiter(now::get);

    @Test
    void allowsUpToCapacityThenRefuses() {
        for (int i = 0; i < 3; i++) {
            assertThat(limiter.tryAcquire(POLICY, "anju").allowed()).isTrue();
        }
        RateLimiter.Decision refused = limiter.tryAcquire(POLICY, "anju");
        assertThat(refused.allowed()).isFalse();
        assertThat(refused.retryAfterSeconds()).isBetween(1L, 1200L);
    }

    @Test
    void refillsOverTime() {
        for (int i = 0; i < 3; i++) {
            limiter.tryAcquire(POLICY, "anju");
        }
        assertThat(limiter.tryAcquire(POLICY, "anju").allowed()).isFalse();
        now.addAndGet(Duration.ofMinutes(10).toMillis()); // 3 per hour = one per 20 minutes
        assertThat(limiter.tryAcquire(POLICY, "anju").allowed()).isFalse();
        now.addAndGet(Duration.ofMinutes(10).toMillis());
        assertThat(limiter.tryAcquire(POLICY, "anju").allowed()).isTrue();
        assertThat(limiter.tryAcquire(POLICY, "anju").allowed()).isFalse();
    }

    @Test
    void neverRefillsPastCapacity() {
        limiter.tryAcquire(POLICY, "anju");
        now.addAndGet(Duration.ofDays(5).toMillis());
        for (int i = 0; i < 3; i++) {
            assertThat(limiter.tryAcquire(POLICY, "anju").allowed()).isTrue();
        }
        assertThat(limiter.tryAcquire(POLICY, "anju").allowed()).isFalse();
    }

    @Test
    void usersAndActionsHaveSeparateBuckets() {
        for (int i = 0; i < 3; i++) {
            limiter.tryAcquire(POLICY, "anju");
        }
        assertThat(limiter.tryAcquire(POLICY, "anju").allowed()).isFalse();
        assertThat(limiter.tryAcquire(POLICY, "biju").allowed()).isTrue();
        assertThat(limiter.tryAcquire(new RateLimitPolicy("other", 3, 3, Duration.ofHours(1)), "anju").allowed()).isTrue();
    }
}
