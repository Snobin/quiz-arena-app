package in.minnal.game.platform.infrastructure.ws;

import java.util.function.LongSupplier;

/** Test access to the package-private time-source constructor of {@link InboundRateLimiter}. */
public final class TestRateLimiters {

    private TestRateLimiters() {
    }

    public static InboundRateLimiter withTime(int perSecond, LongSupplier nanoTime) {
        return new InboundRateLimiter(perSecond, nanoTime);
    }
}
