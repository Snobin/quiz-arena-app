package in.minnal.contracts.realtime;

/**
 * {@code ANSWER_ACCEPTED} (private, with {@code refSeq}): the answer was received in time.
 *
 * <p>In Battle Room it is a receipt only ({@code questionIndex}), with no hint of correctness. In
 * 1v1 modes ({@link MatchMode#revealsOwnAnswerAtAck()}) it also carries the answering player's own
 * result: whether she was right, her points (from the shared {@code Scoring}), the question's
 * answer index and her running total including this answer (AD-5, amended by Story 1.11). The
 * result fields are null (omitted on the wire) for the receipt shape.
 *
 * @param questionIndex 0-based
 * @param correct       1v1 only: whether her pick is the answer
 * @param points        1v1 only: the points this answer scores
 * @param answerIndex   1v1 only: the question's correct option (0–3)
 * @param totalScore    1v1 only: her total including these points
 */
public record AnswerAcceptedPayload(
        int questionIndex,
        Boolean correct,
        Integer points,
        Integer answerIndex,
        Integer totalScore) {

    /** The receipt-only shape (Battle Room). */
    public static AnswerAcceptedPayload receipt(int questionIndex) {
        return new AnswerAcceptedPayload(questionIndex, null, null, null, null);
    }

    /** The 1v1 shape: the receipt plus the player's own result. */
    public static AnswerAcceptedPayload withResult(int questionIndex, boolean correct, int points, int answerIndex,
            int totalScore) {
        return new AnswerAcceptedPayload(questionIndex, correct, points, answerIndex, totalScore);
    }
}
