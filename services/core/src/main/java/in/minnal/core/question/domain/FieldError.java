package in.minnal.core.question.domain;

/** One field-level validation problem, printed as {@code field · problem}. */
public record FieldError(String field, String problem) {

    @Override
    public String toString() {
        return field + " · " + problem;
    }
}
