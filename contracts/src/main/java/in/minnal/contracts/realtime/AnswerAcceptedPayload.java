package in.minnal.contracts.realtime;

/**
 * {@code ANSWER_ACCEPTED} (private, with {@code refSeq}): the answer was received in time. A
 * receipt only, with no hint of correctness (AD-5).
 */
public record AnswerAcceptedPayload(int questionIndex) {
}
