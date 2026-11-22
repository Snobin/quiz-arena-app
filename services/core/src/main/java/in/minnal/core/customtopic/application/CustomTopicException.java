package in.minnal.core.customtopic.application;

import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * A failed custom-topic request, rendered as RFC 9457 Problem Details. {@code callerMistake} says whether the
 * request should give its rate-limit token back (the caller's input was refused, not a limit or a server problem).
 */
public class CustomTopicException extends RuntimeException {

    private final HttpStatus status;
    private final String type;
    private final List<ImportError> errors;
    private final boolean callerMistake;

    private CustomTopicException(HttpStatus status, String type, String detail, List<ImportError> errors, boolean callerMistake) {
        super(detail);
        this.status = status;
        this.type = type;
        this.errors = errors;
        this.callerMistake = callerMistake;
    }

    public static CustomTopicException invalid(List<ImportError> errors) {
        return new CustomTopicException(HttpStatus.BAD_REQUEST, "bad-request",
                errors.size() == 1 ? "1 problem to fix. Nothing was imported." : errors.size() + " problems to fix. Nothing was imported.", errors, true);
    }

    public static CustomTopicException invalid(String detail) {
        return new CustomTopicException(HttpStatus.BAD_REQUEST, "bad-request", detail, List.of(), true);
    }

    public static CustomTopicException tooLarge() {
        return new CustomTopicException(HttpStatus.CONTENT_TOO_LARGE, "payload-too-large",
                "Paste is too large (over 1 MB). Split it into smaller topics.", List.of(), true);
    }

    public static CustomTopicException cap(String detail) {
        return new CustomTopicException(HttpStatus.UNPROCESSABLE_ENTITY, "custom-topic-cap", detail, List.of(), true);
    }

    public static CustomTopicException profileRequired() {
        return new CustomTopicException(HttpStatus.FORBIDDEN, "profile-required", "Set up your profile first.", List.of(), false);
    }

    public static CustomTopicException rateLimited(long retryAfterSeconds) {
        return new CustomTopicException(HttpStatus.TOO_MANY_REQUESTS, "too-many-requests", "Too many imports. Try again in "
                + Math.max(1, retryAfterSeconds) + " seconds.", List.of(), false).withRetryAfter(retryAfterSeconds);
    }

    public static CustomTopicException unavailable() {
        return new CustomTopicException(HttpStatus.SERVICE_UNAVAILABLE, "service-unavailable",
                "This is temporarily unavailable. Try again in a minute.", List.of(), false);
    }

    public static CustomTopicException internal() {
        return new CustomTopicException(HttpStatus.INTERNAL_SERVER_ERROR, "internal-server-error",
                "Something went wrong on our side and nothing was imported. Try again.", List.of(), false);
    }

    private long retryAfter;

    private CustomTopicException withRetryAfter(long seconds) {
        this.retryAfter = seconds;
        return this;
    }

    public HttpStatus status() {
        return status;
    }

    public String type() {
        return type;
    }

    public List<ImportError> errors() {
        return errors;
    }

    public boolean callerMistake() {
        return callerMistake;
    }

    public long retryAfterSeconds() {
        return retryAfter;
    }
}
