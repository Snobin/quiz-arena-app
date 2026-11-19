package in.minnal.core.profile.application;

import in.minnal.core.profile.domain.FieldError;
import java.util.List;

/** The profile form failed validation; nothing was stored or published. */
public class InvalidProfileException extends RuntimeException {

    private final List<FieldError> errors;

    public InvalidProfileException(List<FieldError> errors) {
        super("invalid profile");
        this.errors = errors;
    }

    public List<FieldError> errors() {
        return errors;
    }
}
