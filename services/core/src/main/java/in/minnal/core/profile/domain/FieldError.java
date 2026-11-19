package in.minnal.core.profile.domain;

/** A field-level validation failure: {@code code} is stable (the web maps it to copy), {@code message} is English. */
public record FieldError(String field, String code, String message) {
}
