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
 * @param grace      how long a player whose last session closed has to come back before she
 *                   forfeits (10 s; Story 1.9)
 */
public record MatchSettings(Duration leadIn, Duration window, Duration closeGrace, Duration revealHold,
        Duration grace) {

    /** The default reconnect grace. */
    public static final Duration DEFAULT_GRACE = Duration.ofSeconds(10);

    /** The timeline with the default 10 s reconnect grace. */
    public MatchSettings(Duration leadIn, Duration window, Duration closeGrace, Duration revealHold) {
        this(leadIn, window, closeGrace, revealHold, DEFAULT_GRACE);
    }
}
