package in.minnal.contracts.realtime;

/**
 * The receiver's own accepted answer to the open question, in a {@link SnapshotPayload}. Like
 * {@link AnswerAcceptedPayload}, the result fields are present only in 1v1 modes
 * ({@link MatchMode#revealsOwnAnswerAtAck()}) and null (omitted on the wire) otherwise.
 *
 * @param pickedIndex the option she picked (0–3)
 * @param correct     1v1 only: whether her pick is the answer
 * @param points      1v1 only: the points this answer scores
 * @param answerIndex 1v1 only: the question's correct option
 * @param totalScore  1v1 only: her total including these points
 */
public record MyAnswer(int pickedIndex, Boolean correct, Integer points, Integer answerIndex, Integer totalScore) {

    /** The receipt-only shape (Battle Room): her pick, no result. */
    public static MyAnswer receipt(int pickedIndex) {
        return new MyAnswer(pickedIndex, null, null, null, null);
    }

    /** The 1v1 shape: her pick plus her own result. */
    public static MyAnswer withResult(int pickedIndex, boolean correct, int points, int answerIndex, int totalScore) {
        return new MyAnswer(pickedIndex, correct, points, answerIndex, totalScore);
    }
}
