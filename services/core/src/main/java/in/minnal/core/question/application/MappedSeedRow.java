package in.minnal.core.question.application;

import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.QuestionCandidate;
import java.time.Instant;
import java.util.List;

/**
 * A seed row after mapping and validation. {@code reviewedAt} is null when the column was blank
 * (the loader then uses the load instant). The row may be stored only when {@code errors} is empty.
 */
public record MappedSeedRow(
        int rowNumber,
        QuestionCandidate candidate,
        String sourceRef,
        String reviewedBy,
        Instant reviewedAt,
        List<FieldError> errors) {

    public MappedSeedRow {
        errors = List.copyOf(errors);
    }

    public boolean isValid() {
        return errors.isEmpty();
    }
}
