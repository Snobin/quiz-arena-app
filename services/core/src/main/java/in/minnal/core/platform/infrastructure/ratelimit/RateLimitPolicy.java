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

    /** Player question reports (Story 3.5): 5 reports, refilling 1 every 2 minutes. */
    public static final RateLimitPolicy QUESTION_REPORT = new RateLimitPolicy("question-report", 5, 1, Duration.ofMinutes(2));

    /** Custom-topic imports (Story 6.1): 20 imports, refilling 20 per hour. */
    public static final RateLimitPolicy CUSTOM_IMPORT = new RateLimitPolicy("custom-import", 20, 20, Duration.ofHours(1));

    /** Recent-topic writes (Story 4.1): 30 selections, refilling 1 every 4 seconds. */
    public static final RateLimitPolicy RECENT_TOPIC = new RateLimitPolicy("recent-topic", 30, 1, Duration.ofSeconds(4));

    /** Solo Practice session starts (Story 4.3): 10 starts, refilling 1 every 6 seconds. */
    public static final RateLimitPolicy SOLO_START = new RateLimitPolicy("solo-start", 10, 1, Duration.ofSeconds(6));

    /** Solo Practice answers (Story 4.3): 60 answers, refilling 1 per second. */
    public static final RateLimitPolicy SOLO_ANSWER = new RateLimitPolicy("solo-answer", 60, 1, Duration.ofSeconds(1));

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
