package in.minnal.game.match.application;

import java.time.Duration;

/**
 * The timeline of a match ({@code minnal.match.*}).
 *
 * @param leadIn     after {@code MATCH_FOUND}, before Q1 opens, so clients can subscribe (3 s)
 * @param window     each question's answer window ({@code Scoring.WINDOW}, 15 s; shorter only in tests)
 * @param closeGrace how long after the deadline the window is closed (50 ms): it absorbs up to that
 *                   much delay between an answer being stamped in time on the socket thread and it
 *                   reaching the mailbox; an answer delayed longer than that is rejected
 * @param revealHold the pause after a reveal before the next question (2 s; none after the last)
 */
public record MatchSettings(Duration leadIn, Duration window, Duration closeGrace, Duration revealHold) {
}
