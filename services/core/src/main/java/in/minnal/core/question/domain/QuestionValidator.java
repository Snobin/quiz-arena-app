package in.minnal.core.question.domain;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * The single validator for question content (AD-12). Every write path — seed loader, admin form,
 * CSV upload, custom-topic import — runs it. It collects every problem as a {@link FieldError} and
 * never throws.
 */
@Component
public class QuestionValidator {

    public static final List<String> OPTION_FIELDS = List.of("optionA", "optionB", "optionC", "optionD");

    public List<FieldError> validate(QuestionCandidate candidate) {
        List<FieldError> errors = new ArrayList<>();
        if (candidate == null) {
            errors.add(new FieldError("question", "required"));
            return errors;
        }
        requireEnum(errors, "category", candidate.category(), ContentCategory.class);
        requireText(errors, "subject", candidate.subject());
        requireText(errors, "topic", candidate.topic());
        requireEnum(errors, "examLevel", candidate.examLevel(), ExamLevel.class);
        requireEnum(errors, "difficulty", candidate.difficulty(), Difficulty.class);

        if (Text.isBlank(candidate.textMl()) && Text.isBlank(candidate.textEn())) {
            errors.add(new FieldError("textMl/textEn", "required: at least one of textMl or textEn"));
        }

        List<String> options = candidate.options();
        if (options == null || options.isEmpty()) {
            errors.add(new FieldError("options", "required: exactly 4 options"));
        } else if (options.size() != 4) {
            errors.add(new FieldError("options", "must have exactly 4 options (got " + options.size() + ")"));
        } else {
            Set<String> distinct = new HashSet<>();
            int nonBlank = 0;
            for (int i = 0; i < 4; i++) {
                if (Text.isBlank(options.get(i))) {
                    errors.add(new FieldError(OPTION_FIELDS.get(i), "required: every option must be non-blank"));
                } else {
                    nonBlank++;
                    distinct.add(Text.normalise(options.get(i)).toLowerCase(Locale.ROOT));
                }
            }
            // Compared after NFC normalisation and trimming, ignoring case.
            if (distinct.size() < nonBlank) {
                errors.add(new FieldError("options", "must be 4 different answers"));
            }
        }

        Integer answerIndex = candidate.answerIndex();
        if (answerIndex == null) {
            errors.add(new FieldError("answerIndex", "required: a whole number 0–3"));
        } else if (answerIndex < 0 || answerIndex > 3) {
            errors.add(new FieldError("answerIndex", "must be a whole number 0–3 (got " + answerIndex + ")"));
        }

        requireText(errors, "explanation", candidate.explanation());
        return errors;
    }

    private static void requireText(List<FieldError> errors, String field, String value) {
        if (Text.isBlank(value)) {
            errors.add(new FieldError(field, "required"));
        }
    }

    private static <E extends Enum<E>> void requireEnum(List<FieldError> errors, String field, String value, Class<E> type) {
        if (Text.isBlank(value)) {
            errors.add(new FieldError(field, "required: one of " + Enums.names(type)));
        } else if (Enums.parse(type, value).isEmpty()) {
            errors.add(new FieldError(field, "must be one of " + Enums.names(type) + " (got " + value.strip() + ")"));
        }
    }
}
