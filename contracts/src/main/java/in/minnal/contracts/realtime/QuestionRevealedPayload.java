package in.minnal.contracts.realtime;

import java.util.List;
import java.util.UUID;

/**
 * {@code QUESTION_REVEALED} (broadcast): the window closed for everyone; the answer, explanation,
 * attribution and every participant's result (AD-5, AD-12).
 *
 * @param questionIndex 0-based
 * @param total         how many questions the match asks
 * @param attribution   the source, or null (omitted; the client shows "source not available")
 * @param results       one per participant, in participant order
 */
public record QuestionRevealedPayload(
        int questionIndex,
        int total,
        UUID questionId,
        int version,
        int answerIndex,
        String explanation,
        String attribution,
        List<ParticipantResult> results) {

    public QuestionRevealedPayload {
        results = List.copyOf(results);
    }
}
