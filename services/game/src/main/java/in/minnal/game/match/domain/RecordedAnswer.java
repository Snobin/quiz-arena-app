package in.minnal.game.match.domain;

import java.time.Instant;

/**
 * A participant's accepted answer to one question.
 *
 * @param pickedIndex 0–3
 * @param receivedAt  the server instant it arrived (never a client time)
 * @param points      what {@code Scoring.points} gave it
 * @param responseMs  the question's {@code startedAt} → {@code receivedAt}, in ms (for the results breakdown)
 */
public record RecordedAnswer(int pickedIndex, Instant receivedAt, int points, long responseMs) {
}
