package in.minnal.core.platform.infrastructure.ratelimit;

import java.time.Duration;

/**
 * A token bucket for one kind of action: it holds at most {@code capacity} tokens, each request takes
 * one, and {@code refillTokens} come back every {@code refillPeriod}. The action name is part of the
 * Valkey key ({@code core:rl:{action}:{userId}}), so each action has its own bucket per user.
 */
public record RateLimitPolicy(String action, int capacity, int refillTokens, Duration refillPeriod) {

    /** Admin CSV upload: 10 uploads, refilling 10 per hour. */
    public static final RateLimitPolicy ADMIN_UPLOAD = new RateLimitPolicy("admin-upload", 10, 10, Duration.ofHours(1));

    public RateLimitPolicy {
        if (action == null || action.isBlank() || action.contains(":")) {
            throw new IllegalArgumentException("action must be a non-blank name without ':'");
        }
        if (capacity < 1 || refillTokens < 1 || refillPeriod == null || refillPeriod.isZero() || refillPeriod.isNegative()) {
            throw new IllegalArgumentException("capacity, refillTokens and refillPeriod must be positive");
        }
    }

    /** Tokens added per millisecond. */
    public double refillPerMillis() {
        return (double) refillTokens / refillPeriod.toMillis();
    }
}
