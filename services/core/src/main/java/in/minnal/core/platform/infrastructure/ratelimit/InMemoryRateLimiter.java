package in.minnal.core.platform.infrastructure.ratelimit;

import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * The same token bucket in process memory, for the shared integration-test context (Valkey
 * autoconfiguration is excluded there) and for unit tests. Selected by {@code minnal.ratelimit.store=memory}.
 */
@Component
@ConditionalOnProperty(name = "minnal.ratelimit.store", havingValue = "memory")
public class InMemoryRateLimiter implements RateLimiter {

    private record Bucket(double tokens, long at) {
    }

    private final Map<String, Bucket> buckets = new HashMap<>();
    private final LongSupplier millis;

    public InMemoryRateLimiter() {
        this(System::currentTimeMillis);
    }

    public InMemoryRateLimiter(LongSupplier millis) {
        this.millis = millis;
    }

    @Override
    public synchronized Decision tryAcquire(RateLimitPolicy policy, String userId) {
        long now = millis.getAsLong();
        String key = policy.action() + ":" + userId;
        Bucket bucket = buckets.getOrDefault(key, new Bucket(policy.capacity(), now));
        double rate = policy.refillPerMillis();
        double tokens = Math.min(policy.capacity(), bucket.tokens() + Math.max(0, now - bucket.at()) * rate);
        if (tokens >= 1) {
            buckets.put(key, new Bucket(tokens - 1, now));
            return Decision.allow();
        }
        buckets.put(key, new Bucket(tokens, now));
        return Decision.refuse((long) Math.ceil(Math.ceil((1 - tokens) / rate) / 1000.0));
    }

    /** Test helper: forget every bucket. */
    public synchronized void reset() {
        buckets.clear();
    }
}
