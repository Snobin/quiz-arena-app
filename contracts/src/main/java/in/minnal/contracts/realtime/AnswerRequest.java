package in.minnal.contracts.realtime;

/**
 * The client's {@code /app/match/{matchId}/answer} body. Any other field (a client timestamp) is ignored:
 * the server alone times answers (AD-6).
 *
 * @param questionIndex the 0-based question the answer is for (null when absent: rejected)
 * @param optionIndex   0–3 (null when absent: rejected)
 * @param prevAckRttMs  optional: the client-measured round trip of this player's previous answer, in milliseconds. It feeds a
 *                      dashboard histogram only (clamped to 0–10,000) and never timing or scoring (Story 7.3b)
 */
public record AnswerRequest(Integer questionIndex, Integer optionIndex, Integer prevAckRttMs) {

    /** An answer that reports no round trip. */
    public AnswerRequest(Integer questionIndex, Integer optionIndex) {
        this(questionIndex, optionIndex, null);
    }
}
