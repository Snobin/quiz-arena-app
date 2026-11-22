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

    public static final int MAX_TEXT = 1000;
    public static final int MAX_OPTION = 300;
    public static final int MAX_EXPLANATION = 2000;
    public static final int MAX_ATTRIBUTION = 120;

    public static final List<String> OPTION_FIELDS = List.of("optionA", "optionB", "optionC", "optionD");

    /** Which fields a write path owns: the bank carries tags and attribution, a custom topic does not. */
    public enum Profile { BANK, CUSTOM_TOPIC }

    /** Validates as a bank question (admin form, CSV upload, seed). */
    public List<FieldError> validate(QuestionCandidate candidate) {
        return validate(candidate, Profile.BANK);
    }

    public List<FieldError> validate(QuestionCandidate candidate, Profile profile) {
        List<FieldError> errors = new ArrayList<>();
        if (candidate == null) {
            errors.add(new FieldError("question", "required"));
            return errors;
        }
        if (profile == Profile.BANK) {
            requireEnum(errors, "category", candidate.category(), ContentCategory.class);
            requireText(errors, "subject", candidate.subject());
            requireText(errors, "topic", candidate.topic());
            requireEnum(errors, "examLevel", candidate.examLevel(), ExamLevel.class);
            requireEnum(errors, "difficulty", candidate.difficulty(), Difficulty.class);
        }

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

        // Length caps, counted in characters (code points) after NFC normalisation and trimming.
        cap(errors, "textMl", candidate.textMl(), MAX_TEXT);
        cap(errors, "textEn", candidate.textEn(), MAX_TEXT);
        if (options != null && options.size() == 4) {
            for (int i = 0; i < 4; i++) {
                cap(errors, OPTION_FIELDS.get(i), options.get(i), MAX_OPTION);
            }
        }
        cap(errors, "explanation", candidate.explanation(), MAX_EXPLANATION);
        if (profile == Profile.BANK) {
            cap(errors, "attribution", candidate.attribution(), MAX_ATTRIBUTION);
        }
        return errors;
    }

    private static void cap(List<FieldError> errors, String field, String value, int max) {
        String normalised = Text.normalise(value);
        if (normalised == null) {
            return;
        }
        int length = normalised.codePointCount(0, normalised.length());
        if (length > max) {
            errors.add(new FieldError(field, "must be at most " + max + " characters (got " + length + ")",
                    "Shorten it by " + (length - max) + " characters."));
        }
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
