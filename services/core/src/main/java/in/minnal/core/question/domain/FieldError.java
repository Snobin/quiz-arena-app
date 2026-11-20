package in.minnal.core.question.domain;

/** One field-level validation problem, printed as {@code field · problem}. {@code fix} is an optional hint. */
public record FieldError(String field, String problem, String fix) {

    public FieldError(String field, String problem) {
        this(field, problem, null);
    }

    @Override
    public String toString() {
        return field + " · " + problem;
    }
}
