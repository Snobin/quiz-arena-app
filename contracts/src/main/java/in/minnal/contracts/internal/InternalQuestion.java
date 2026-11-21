package in.minnal.contracts.internal;

import java.util.List;
import java.util.UUID;

/**
 * One question of a drawn set, with its answer. Exists only on the internal network and in
 * game-service actor memory (AD-5); never sent to a client as is.
 *
 * @param textMl      Malayalam text, or null
 * @param textEn      English text, or null (at least one of the two is present)
 * @param options     exactly 4 options
 * @param answerIndex 0–3
 * @param attribution source attribution, or null ("source not available" is shown then)
 * @param topicId     the bank topic the question belongs to, or null (custom questions, or unknown)
 */
public record InternalQuestion(
        UUID questionId,
        int version,
        String textMl,
        String textEn,
        List<String> options,
        int answerIndex,
        String explanation,
        String attribution,
        UUID topicId) {

    public InternalQuestion {
        options = List.copyOf(options);
    }

    /** A question without a topic. */
    public InternalQuestion(UUID questionId, int version, String textMl, String textEn, List<String> options,
                            int answerIndex, String explanation, String attribution) {
        this(questionId, version, textMl, textEn, options, answerIndex, explanation, attribution, null);
    }
}
