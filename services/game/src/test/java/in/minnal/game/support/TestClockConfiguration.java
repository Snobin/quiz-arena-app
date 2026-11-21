package in.minnal.game.support;

import in.minnal.game.platform.infrastructure.ws.InboundRateLimiter;
import in.minnal.game.platform.infrastructure.ws.TestRateLimiters;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Replaces the server clock with a {@link MutableClock}, so the 4 s and 8 s rules need no sleeps,
 * the {@code minnal.match.completed} publisher with a {@link RecordingMatchCompletedPublisher}, and
 * the room timers with {@link ManualRoomTimers}, and the inbound rate limiter's time source with {@link ControllableNanos} (real time until a test
 * freezes it). The production {@code InboundRateLimiter} component still exists but is shadowed by
 * the {@code @Primary} test one, which the interceptor and the WebSocket config use.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestClockConfiguration {

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock(Instant.parse("2026-11-12T10:00:00Z"));
    }

    @Bean
    @Primary
    RecordingMatchCompletedPublisher recordingMatchCompletedPublisher() {
        return new RecordingMatchCompletedPublisher();
    }

    /** Room expiry and host grace fire when a test says so, not after real hours or seconds. */
    @Bean
    @Primary
    ManualRoomTimers manualRoomTimers() {
        return new ManualRoomTimers();
    }

    @Bean
    ControllableNanos rateLimiterNanos() {
        return new ControllableNanos();
    }

    @Bean
    @Primary
    InboundRateLimiter testInboundRateLimiter(@Value("${minnal.ws.inbound-rate:10}") int perSecond,
            ControllableNanos rateLimiterNanos) {
        return TestRateLimiters.withTime(perSecond, rateLimiterNanos);
    }
}
