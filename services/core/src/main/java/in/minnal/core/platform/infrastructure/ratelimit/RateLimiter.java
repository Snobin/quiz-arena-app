package in.minnal.core.platform.infrastructure.ratelimit;

/** A per-user token-bucket limiter for REST writes, available to any core endpoint. */
public interface RateLimiter {

    /** The outcome of one attempt; {@code retryAfterSeconds} is at least 1 when the request is refused, 0 when allowed. */
    record Decision(boolean allowed, long retryAfterSeconds) {

        public static Decision allow() {
            return new Decision(true, 0);
        }

        public static Decision refuse(long retryAfterSeconds) {
            return new Decision(false, Math.max(1, retryAfterSeconds));
        }
    }

    /** Takes one token from the user's bucket for this policy's action, atomically. */
    Decision tryAcquire(RateLimitPolicy policy, String userId);

    /**
     * Gives back one token taken by {@link #tryAcquire}, never past the bucket's capacity. Used when the
     * request turns out to be the caller's mistake (it failed validation), so honest slips cost nothing.
     */
    void refund(RateLimitPolicy policy, String userId);
}
