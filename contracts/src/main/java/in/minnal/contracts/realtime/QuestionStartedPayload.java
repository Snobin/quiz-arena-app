package in.minnal.contracts.realtime;

import java.time.Instant;

/**
 * {@code QUESTION_STARTED} (broadcast): a question's window opens. Sent only when it opens, never
 * earlier (AD-5).
 *
 * @param questionIndex 0-based (0–9 in a Quick Match)
 * @param total         how many questions the match asks
 * @param startedAt     the server instant the window opened
 * @param deadline      {@code startedAt} + the window (15 s); answers received later are rejected
 */
public record QuestionStartedPayload(int questionIndex, int total, Instant startedAt, Instant deadline,
        QuestionView question) {
}
