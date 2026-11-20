package in.minnal.core.question.application;

import java.util.List;

/**
 * The admin form as sent. Everything is raw so the validator can report every problem; ids are
 * strings so a malformed id is a field error, not a parse failure. {@code rowVersion} is used only
 * when saving an open draft.
 */
public record QuestionPayload(
        String category,
        String subjectId,
        String topicId,
        String examLevel,
        String difficulty,
        String textMl,
        String textEn,
        List<String> options,
        Integer answerIndex,
        String explanation,
        String attribution,
        String sourceRef,
        Integer rowVersion) {
}
