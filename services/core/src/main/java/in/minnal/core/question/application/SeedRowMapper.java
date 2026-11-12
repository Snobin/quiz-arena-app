package in.minnal.core.question.application;

import in.minnal.core.question.domain.FieldError;
import in.minnal.core.question.domain.QuestionCandidate;
import in.minnal.core.question.domain.QuestionValidator;
import in.minnal.core.question.domain.Text;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Maps a seed CSV row to a {@link QuestionCandidate}, runs the shared {@link QuestionValidator},
 * and adds the seed-only rules: {@code sourceRef} and {@code reviewedBy} are required and
 * {@code reviewedAt}, when present, is ISO-8601. Every value except {@code attribution} is
 * NFC-normalised and trimmed; {@code attribution} is kept verbatim (only a blank value becomes null).
 * A row whose cell count does not match the header is reported as a {@code row} problem only, since
 * its values may sit in the wrong columns.
 */
@Component
public class SeedRowMapper {

    public static final String REVIEWED_BY_REQUIRED =
            "required: every seeded question must name the admin who reviewed it";
    static final String SOURCE_REF_REQUIRED = "required: every seeded question needs a unique sourceRef";
    static final String ANSWER_INDEX_NOT_A_NUMBER = "must be a whole number 0–3";
    static final String REVIEWED_AT_INVALID = "must be an ISO-8601 instant, e.g. 2026-11-11T09:30:00Z";

    private final QuestionValidator validator;

    public SeedRowMapper(QuestionValidator validator) {
        this.validator = validator;
    }

    public MappedSeedRow map(SeedRow row) {
        if (row.structureProblem() != null) {
            return new MappedSeedRow(row.rowNumber(), null, null, null, null,
                    List.of(new FieldError("row", row.structureProblem())));
        }
        List<FieldError> mappingErrors = new ArrayList<>();

        Integer answerIndex = null;
        String rawAnswer = value(row, "answerIndex");
        if (rawAnswer != null) {
            try {
                answerIndex = Integer.valueOf(rawAnswer);
            } catch (NumberFormatException e) {
                mappingErrors.add(new FieldError("answerIndex", ANSWER_INDEX_NOT_A_NUMBER + " (got " + rawAnswer + ")"));
            }
        }

        QuestionCandidate candidate = new QuestionCandidate(
                value(row, "category"),
                value(row, "subject"),
                value(row, "topic"),
                value(row, "examLevel"),
                value(row, "difficulty"),
                value(row, "textMl"),
                value(row, "textEn"),
                List.of(orEmpty(row, "optionA"), orEmpty(row, "optionB"), orEmpty(row, "optionC"), orEmpty(row, "optionD")),
                answerIndex,
                value(row, "explanation"),
                // Attribution is stored verbatim; only an empty value becomes null.
                Text.isBlank(row.get("attribution")) ? null : row.get("attribution"));

        // A field the mapper already rejected is not reported a second time by the validator.
        Set<String> rejected = mappingErrors.stream().map(FieldError::field).collect(Collectors.toSet());
        List<FieldError> errors = new ArrayList<>();
        for (FieldError error : validator.validate(candidate)) {
            if (!rejected.contains(error.field())) {
                errors.add(error);
            }
        }
        errors.addAll(mappingErrors);

        String sourceRef = value(row, "sourceRef");
        if (sourceRef == null) {
            errors.add(new FieldError("sourceRef", SOURCE_REF_REQUIRED));
        }
        String reviewedBy = value(row, "reviewedBy");
        if (reviewedBy == null) {
            errors.add(new FieldError("reviewedBy", REVIEWED_BY_REQUIRED));
        }
        Instant reviewedAt = null;
        String rawReviewedAt = value(row, "reviewedAt");
        if (rawReviewedAt != null) {
            reviewedAt = parseInstant(rawReviewedAt);
            if (reviewedAt == null) {
                errors.add(new FieldError("reviewedAt", REVIEWED_AT_INVALID + " (got " + rawReviewedAt + ")"));
            }
        }
        return new MappedSeedRow(row.rowNumber(), candidate, sourceRef, reviewedBy, reviewedAt, errors);
    }

    /** NFC-normalised and trimmed; blank becomes null. */
    private static String value(SeedRow row, String column) {
        return Text.normaliseToNull(row.get(column));
    }

    private static String orEmpty(SeedRow row, String column) {
        String value = value(row, column);
        return value == null ? "" : value;
    }

    private static Instant parseInstant(String value) {
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException e) {
            try {
                return OffsetDateTime.parse(value).toInstant();
            } catch (DateTimeParseException ignored) {
                return null;
            }
        }
    }
}
