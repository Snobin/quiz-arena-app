package in.minnal.contracts.realtime;

import java.util.List;
import java.util.UUID;

/**
 * One asked question in a {@link MatchEndedPayload}, answer included: the match is over, so
 * nothing about it is secret any more (AD-5). Questions that never opened are not listed.
 *
 * @param textMl      Malayalam text, or null (omitted)
 * @param textEn      English text, or null (omitted)
 * @param options     exactly 4 options
 * @param answerIndex 0–3
 * @param attribution the source, or null (omitted; the client shows "source not available")
 * @param topicId     the bank topic of the question, or null (custom questions)
 */
public record ResultQuestion(
        UUID questionId,
        int version,
        String textMl,
        String textEn,
        List<String> options,
        int answerIndex,
        String explanation,
        String attribution,
        UUID topicId) {

    public ResultQuestion {
        options = List.copyOf(options);
    }

    /** A question without a topic. */
    public ResultQuestion(UUID questionId, int version, String textMl, String textEn, List<String> options,
                          int answerIndex, String explanation, String attribution) {
        this(questionId, version, textMl, textEn, options, answerIndex, explanation, attribution, null);
    }
}
