package in.minnal.game.platform.infrastructure.ws;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * The per-connection inbound limit (NFR11): a token bucket per STOMP session holding
 * {@code minnal.ws.inbound-rate} tokens (10) and refilling at that many per second. A frame
 * without a token is dropped. At most one {@code RATE_LIMITED} notice per session per second is
 * due ({@link Decision#DROP_AND_NOTIFY}). The bucket goes when the session closes.
 *
 * <p>Uses a monotonic clock ({@code System.nanoTime}), never the server's wall clock.
 */
@Component
public class InboundRateLimiter {

    /** What to do with one inbound frame. */
    public enum Decision {
        ALLOW,
        DROP,
        DROP_AND_NOTIFY
    }

    private static final long SECOND_NANOS = 1_000_000_000L;

    private final double capacity;
    private final LongSupplier nanoTime;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Autowired
    public InboundRateLimiter(@Value("${minnal.ws.inbound-rate:10}") int perSecond) {
        this(perSecond, System::nanoTime);
    }

    InboundRateLimiter(int perSecond, LongSupplier nanoTime) {
        if (perSecond < 1) {
            throw new IllegalArgumentException("minnal.ws.inbound-rate must be at least 1");
        }
        this.capacity = perSecond;
        this.nanoTime = nanoTime;
    }

    public Decision acquire(String sessionId) {
        long now = nanoTime.getAsLong();
        return buckets.computeIfAbsent(sessionId, id -> new Bucket(capacity, now)).take(now);
    }

    public void remove(String sessionId) {
        if (sessionId != null) {
            buckets.remove(sessionId);
        }
    }

    @EventListener
    void onDisconnect(SessionDisconnectEvent event) {
        remove(event.getSessionId());
    }

    /** Open buckets (tests). */
    int size() {
        return buckets.size();
    }

    private final class Bucket {

        private double tokens;
        private long refilledAt;
        private long notifiedAt;
        private boolean notified;

        Bucket(double tokens, long now) {
            this.tokens = tokens;
            this.refilledAt = now;
        }

        synchronized Decision take(long now) {
            tokens = Math.min(capacity, tokens + (now - refilledAt) * capacity / SECOND_NANOS);
            refilledAt = now;
            if (tokens >= 1) {
                tokens -= 1;
                return Decision.ALLOW;
            }
            if (!notified || now - notifiedAt >= SECOND_NANOS) {
                notified = true;
                notifiedAt = now;
                return Decision.DROP_AND_NOTIFY;
            }
            return Decision.DROP;
        }
    }
}
