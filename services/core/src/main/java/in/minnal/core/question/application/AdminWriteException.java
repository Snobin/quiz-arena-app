package in.minnal.core.question.application;

import in.minnal.core.question.domain.FieldError;
import java.util.List;
import java.util.Map;

/** An admin write that cannot proceed: 400 with field errors, 404, or 409 (with optional extra properties). */
public class AdminWriteException extends RuntimeException {

    public enum Kind { INVALID, NOT_FOUND, CONFLICT }

    private final Kind kind;
    private final List<FieldError> errors;
    private final Map<String, Object> properties;

    private AdminWriteException(Kind kind, String detail, List<FieldError> errors, Map<String, Object> properties) {
        super(detail);
        this.kind = kind;
        this.errors = List.copyOf(errors);
        this.properties = Map.copyOf(properties);
    }

    public static AdminWriteException invalid(List<FieldError> errors) {
        String detail = errors.size() == 1 ? "1 problem to fix before saving." : errors.size() + " problems to fix before saving.";
        return new AdminWriteException(Kind.INVALID, detail, errors, Map.of());
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

    public List<FieldError> errors() {
        return errors;
    }

    public Map<String, Object> properties() {
        return properties;
    }
}
