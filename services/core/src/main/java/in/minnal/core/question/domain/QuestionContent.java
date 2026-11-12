package in.minnal.core.question.domain;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Validated, normalised content of one question version. */
public record QuestionContent(
        ContentCategory category,
        UUID subjectId,
        UUID topicId,
        ExamLevel examLevel,
        Difficulty difficulty,
        String textMl,
        String textEn,
        List<String> options,
        int answerIndex,
        String explanation,
        String attribution) {

    public QuestionContent {
        Objects.requireNonNull(category, "category");
        Objects.requireNonNull(subjectId, "subjectId");
        Objects.requireNonNull(topicId, "topicId");
        Objects.requireNonNull(examLevel, "examLevel");
        Objects.requireNonNull(difficulty, "difficulty");
        Objects.requireNonNull(explanation, "explanation");
        if (textMl == null && textEn == null) {
            throw new IllegalArgumentException("textMl or textEn is required");
        }
        options = List.copyOf(options);
        if (options.size() != 4) {
            throw new IllegalArgumentException("exactly 4 options are required");
        }
        if (answerIndex < 0 || answerIndex > 3) {
            throw new IllegalArgumentException("answerIndex must be 0–3");
        }
    }
}
