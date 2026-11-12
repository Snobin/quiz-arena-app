package in.minnal.core.question.domain;

import java.util.List;

/**
 * A question as submitted by any write path (seed CSV now; admin form, CSV upload and custom-topic
 * import later), before validation. Tags are raw strings so the validator can report unknown values.
 */
public record QuestionCandidate(
        String category,
        String subject,
        String topic,
        String examLevel,
        String difficulty,
        String textMl,
        String textEn,
        List<String> options,
        Integer answerIndex,
        String explanation,
        String attribution) {
}
