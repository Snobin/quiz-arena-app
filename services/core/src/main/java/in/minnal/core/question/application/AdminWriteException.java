package in.minnal.core.question.application;

import in.minnal.core.question.domain.FieldError;
import java.util.List;
import java.util.Map;

/**
 * An admin write that cannot proceed: 400 with field errors (or one file-level error), 404, 409 (with optional extra
 * properties), 429 with a retry delay, or 500.
 */
public class AdminWriteException extends RuntimeException {

    public enum Kind { INVALID, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL, UNAVAILABLE }

    private final Kind kind;
    private final List<FieldError> errors;
    private final Map<String, Object> properties;
    private final long retryAfterSeconds;

    private AdminWriteException(Kind kind, String detail, List<FieldError> errors, Map<String, Object> properties) {
        this(kind, detail, errors, properties, 0);
    }

    private AdminWriteException(Kind kind, String detail, List<FieldError> errors, Map<String, Object> properties, long retryAfterSeconds) {
        super(detail);
        this.retryAfterSeconds = retryAfterSeconds;
        this.kind = kind;
        this.errors = List.copyOf(errors);
        this.properties = Map.copyOf(properties);
    }

    public static AdminWriteException invalid(List<FieldError> errors) {
        String detail = errors.size() == 1 ? "1 problem to fix before saving." : errors.size() + " problems to fix before saving.";
        return new AdminWriteException(Kind.INVALID, detail, errors, Map.of());
    }

    /** A problem with the whole file, not one row: the problem text is also the response detail. */
    public static AdminWriteException invalidFile(String problem) {
        return new AdminWriteException(Kind.INVALID, problem, List.of(new FieldError("file", problem)), Map.of());
    }

    public static AdminWriteException rateLimited(long retryAfterSeconds) {
        return new AdminWriteException(Kind.RATE_LIMITED, "Too many requests. Try again later.", List.of(), Map.of(), retryAfterSeconds);
    }

    /** A dependency (the rate-limit store) is down; the request fails closed with a 503. */
    public static AdminWriteException unavailable() {
        return new AdminWriteException(Kind.UNAVAILABLE, "This is temporarily unavailable. Try again in a minute.", List.of(), Map.of());
    }

    public static AdminWriteException internal(String detail) {
        return new AdminWriteException(Kind.INTERNAL, detail, List.of(), Map.of());
    }

    public static AdminWriteException notFound(String detail) {
        return new AdminWriteException(Kind.NOT_FOUND, detail, List.of(), Map.of());
    }

    public static AdminWriteException conflict(String detail) {
        return new AdminWriteException(Kind.CONFLICT, detail, List.of(), Map.of());
    }

    public static AdminWriteException conflict(String detail, Map<String, Object> properties) {
        return new AdminWriteException(Kind.CONFLICT, detail, List.of(), properties);
    }

    public Kind kind() {
        return kind;
    }

    /** Seconds until the request may be retried; meaningful for {@link Kind#RATE_LIMITED}. */
    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }

    public List<FieldError> errors() {
        return errors;
    }

    public Map<String, Object> properties() {
        return properties;
    }
}
