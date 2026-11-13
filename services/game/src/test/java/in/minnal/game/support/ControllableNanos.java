package in.minnal.game.support;

import java.time.Duration;
import java.util.function.LongSupplier;

/**
 * A monotonic time source for the inbound rate limiter in integration tests: it follows
 * {@code System.nanoTime} until a test {@link #freeze()}s it, after which time moves only by
 * {@link #advance(Duration)}. {@link #release()} returns to the real clock (call it in a
 * {@code finally}; {@code GameIntegrationTest} also releases it after every test, since the
 * Spring context is shared). Freezing stops time for every session's bucket in the context, which
 * is safe only because integration tests run one at a time (no parallel JUnit execution).
 */
public final class ControllableNanos implements LongSupplier {

    /** Real time minus reported time: moves forward while frozen, so released time never jumps back. */
    private long lag;
    /** The frozen reading, or null while following the real clock. */
    private Long frozenAt;

    @Override
    public synchronized long getAsLong() {
        return frozenAt != null ? frozenAt : System.nanoTime() - lag;
    }

    public synchronized void freeze() {
        if (frozenAt == null) {
            frozenAt = System.nanoTime() - lag;
        }
    }

    public synchronized void advance(Duration by) {
        if (frozenAt == null) {
            throw new IllegalStateException("freeze() first");
        }
        frozenAt += by.toNanos();
    }

    public synchronized void release() {
        if (frozenAt != null) {
            lag = System.nanoTime() - frozenAt;
            frozenAt = null;
        }
    }
}
