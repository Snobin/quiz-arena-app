package in.minnal.contracts.realtime;

/**
 * One participant's answer to one asked question, in a {@link ParticipantBreakdown}.
 *
 * @param pickedIndex the option she picked, or null (omitted) when she did not answer
 * @param correct     whether the pick was the answer (false when she did not answer)
 * @param responseMs  the question's {@code startedAt} → the server's receive instant, or null
 *                    (omitted) when she did not answer
 * @param points      what the answer scored ({@code Scoring.points})
 */
public record BreakdownAnswer(Integer pickedIndex, boolean correct, Long responseMs, int points) {

    /** No answer: nothing picked, not correct, 0 points. */
    public static BreakdownAnswer missed() {
        return new BreakdownAnswer(null, false, null, 0);
    }
}
