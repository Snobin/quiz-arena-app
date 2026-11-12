package in.minnal.game.platform.infrastructure.ws;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.platform.infrastructure.ws.InboundRateLimiter.Decision;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class InboundRateLimiterTest {

    final AtomicLong nanos = new AtomicLong(1_000);
    final InboundRateLimiter limiter = new InboundRateLimiter(10, nanos::get);

    void advanceMs(long ms) {
        nanos.addAndGet(ms * 1_000_000);
    }

    @Test
    void twentyFiveFramesAtOnceLetTenThroughAndNotifyOnce() {
        List<Decision> decisions = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            decisions.add(limiter.acquire("s1"));
        }
        assertThat(decisions.stream().filter(d -> d == Decision.ALLOW)).hasSize(10);
        assertThat(decisions.stream().filter(d -> d == Decision.DROP_AND_NOTIFY)).hasSize(1);
        assertThat(decisions.subList(10, 25)).first().isEqualTo(Decision.DROP_AND_NOTIFY);
        // Another session has its own bucket.
        assertThat(limiter.acquire("s2")).isEqualTo(Decision.ALLOW);
    }

    @Test
    void theBucketRefillsAtTheRateAndNoticesAreAtMostOnePerSecond() {
        for (int i = 0; i < 10; i++) {
            limiter.acquire("s1");
        }
        assertThat(limiter.acquire("s1")).isEqualTo(Decision.DROP_AND_NOTIFY);
        advanceMs(100); // one token back
        assertThat(limiter.acquire("s1")).isEqualTo(Decision.ALLOW);
        assertThat(limiter.acquire("s1")).isEqualTo(Decision.DROP);
        advanceMs(500);
        for (int i = 0; i < 5; i++) {
            assertThat(limiter.acquire("s1")).isEqualTo(Decision.ALLOW);
        }
        assertThat(limiter.acquire("s1")).as("within a second of the last notice").isEqualTo(Decision.DROP);
        advanceMs(1_000);
        for (int i = 0; i < 10; i++) {
            assertThat(limiter.acquire("s1")).as("capped at 10").isEqualTo(Decision.ALLOW);
        }
        assertThat(limiter.acquire("s1")).isEqualTo(Decision.DROP_AND_NOTIFY);
    }

    @Test
    void aClosedSessionsBucketIsRemoved() {
        limiter.acquire("s1");
        limiter.acquire("s2");
        assertThat(limiter.size()).isEqualTo(2);
        limiter.remove("s1");
        limiter.remove(null);
        assertThat(limiter.size()).isEqualTo(1);
    }
}
