package in.minnal.contracts.realtime;

/**
 * The client's {@code /app/match/{matchId}/answer} body. Any other field (a client timestamp,
 * {@code prevAckRttMs}) is ignored: the server alone times answers (AD-6).
 *
 * @param questionIndex the 0-based question the answer is for (null when absent: rejected)
 * @param optionIndex   0–3 (null when absent: rejected)
 */
public record AnswerRequest(Integer questionIndex, Integer optionIndex) {
}
