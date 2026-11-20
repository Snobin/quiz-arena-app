package in.minnal.core.platform.infrastructure.ratelimit;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/**
 * Token bucket in Valkey. One Lua script reads, refills and takes a token atomically, using the
 * server clock, so concurrent requests (and several core instances) cannot overspend a bucket. The
 * key is {@code <key-prefix>rl:{action}:{userId}} ({@code core:rl:...}); it expires once the bucket
 * would be full again.
 */
@Component
@ConditionalOnProperty(name = "minnal.ratelimit.store", havingValue = "valkey", matchIfMissing = true)
public class ValkeyRateLimiter implements RateLimiter {

    /** KEYS[1] bucket; ARGV: capacity, refill tokens per ms, cost. Returns {allowed (1/0), retryAfterMs}. */
    static final String SCRIPT = """
            local capacity = tonumber(ARGV[1])
            local rate = tonumber(ARGV[2])
            local cost = tonumber(ARGV[3])
            local t = redis.call('TIME')
            local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
            local state = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
            local tokens = tonumber(state[1])
            local ts = tonumber(state[2])
            if tokens == nil or ts == nil then
              tokens = capacity
              ts = now
            end
            local elapsed = math.max(0, now - ts)
            tokens = math.min(capacity, tokens + elapsed * rate)
            local allowed = 0
            local retry = 0
            if tokens >= cost then
              tokens = tokens - cost
              allowed = 1
            else
              retry = math.ceil((cost - tokens) / rate)
            end
            redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(now))
            redis.call('PEXPIRE', KEYS[1], math.ceil((capacity - tokens) / rate) + 1000)
            return {allowed, retry}
            """;

    private static final DefaultRedisScript<List> LUA = new DefaultRedisScript<>(SCRIPT, List.class);

    private final StringRedisTemplate redis;
    private final String keyPrefix;

    public ValkeyRateLimiter(StringRedisTemplate redis, @Value("${minnal.valkey.key-prefix:core:}") String keyPrefix) {
        this.redis = redis;
        this.keyPrefix = keyPrefix;
    }

    static String key(String prefix, RateLimitPolicy policy, String userId) {
        return prefix + "rl:" + policy.action() + ":" + userId;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Decision tryAcquire(RateLimitPolicy policy, String userId) {
        List<Long> result = (List<Long>) redis.execute(LUA, List.of(key(keyPrefix, policy, userId)),
                Integer.toString(policy.capacity()), Double.toString(policy.refillPerMillis()), "1");
        if (result == null || result.size() < 2) {
            throw new IllegalStateException("rate limiter script returned nothing");
        }
        return result.get(0) == 1L ? Decision.allow() : Decision.refuse((long) Math.ceil(result.get(1) / 1000.0));
    }
}
