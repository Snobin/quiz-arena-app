package in.minnal.game.match.domain;

import java.time.Instant;

/**
 * A participant's accepted answer to one question.
 *
 * @param pickedIndex 0–3
 * @param receivedAt  the server instant it arrived (never a client time)
 * @param points      what {@code Scoring.points} gave it
 */
public record RecordedAnswer(int pickedIndex, Instant receivedAt, int points) {
}
