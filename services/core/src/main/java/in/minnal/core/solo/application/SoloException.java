package in.minnal.core.solo.application;

/** A Solo Practice failure carrying the HTTP meaning the controller maps to Problem Details. */
public class SoloException extends RuntimeException {

    public enum Kind { INVALID, NOT_FOUND, CONFLICT, TOPIC_UNAVAILABLE, CUSTOM_UNAVAILABLE, RATE_LIMITED }

    private final Kind kind;
    private final long retryAfterSeconds;

    public SoloException(Kind kind, String message) {
        this(kind, message, 0);
    }

    public SoloException(Kind kind, String message, long retryAfterSeconds) {
        super(message);
        this.kind = kind;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public Kind kind() {
        return kind;
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
