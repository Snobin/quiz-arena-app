package in.minnal.contracts.metrics;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.turbo.TurboFilter;
import ch.qos.logback.core.spi.FilterReply;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import org.slf4j.LoggerFactory;
import org.slf4j.Marker;

/**
 * Lets the OTLP registry's push-failure log through at most once per window (Story 7.3a): an unreachable endpoint must not
 * flood the logs every 60 s. Only that registry's WARN and ERROR events are throttled.
 */
public final class PushFailureThrottle extends TurboFilter {

    public static final String LOGGER = "io.micrometer.registry.otlp";
    public static final Duration WINDOW = Duration.ofMinutes(10);

    private final long windowNanos;
    private final LongSupplier nanos;
    private final AtomicLong lastAllowed = new AtomicLong();
    private volatile boolean first = true;

    public PushFailureThrottle(Duration window, LongSupplier nanos) {
        this.windowNanos = window.toNanos();
        this.nanos = nanos;
    }

    /** Adds the throttle to the running Logback context, once. A no-op when SLF4J is not backed by Logback. */
    public static void install() {
        if (LoggerFactory.getILoggerFactory() instanceof LoggerContext context
                && context.getTurboFilterList().stream().noneMatch(PushFailureThrottle.class::isInstance)) {
            context.addTurboFilter(new PushFailureThrottle(WINDOW, System::nanoTime));
        }
    }

    @Override
    public FilterReply decide(Marker marker, Logger logger, Level level, String format, Object[] params, Throwable t) {
        if (logger == null || !logger.getName().startsWith(LOGGER) || level == null || !level.isGreaterOrEqual(Level.WARN)) {
            return FilterReply.NEUTRAL;
        }
        long now = nanos.getAsLong();
        synchronized (this) {
            if (first || now - lastAllowed.get() >= windowNanos) {
                first = false;
                lastAllowed.set(now);
                return FilterReply.NEUTRAL;
            }
        }
        return FilterReply.DENY;
    }
}
