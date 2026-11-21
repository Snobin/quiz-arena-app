package in.minnal.game.match.application;

import in.minnal.contracts.realtime.MatchMode;
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
 * @param roomRevealHold the reveal hold of a Battle Room match (3 s; Story 5.4)
 * @param scoreboardCoalesce at most one {@code SCOREBOARD} per this window in a Battle Room (250 ms); zero sends one per answer
 */
public record MatchSettings(Duration leadIn, Duration window, Duration closeGrace, Duration revealHold,
        Duration grace, Duration roomRevealHold, Duration scoreboardCoalesce) {

    /** The default reconnect grace. */
    public static final Duration DEFAULT_GRACE = Duration.ofSeconds(10);

    /** The Battle Room reveal hold (Story 5.4). */
    public static final Duration DEFAULT_ROOM_REVEAL_HOLD = Duration.ofSeconds(3);
    /** The Battle Room scoreboard coalescing window (Story 5.4). */
    public static final Duration DEFAULT_SCOREBOARD_COALESCE = Duration.ofMillis(250);

    /** The timeline with the default 10 s reconnect grace and the default Battle Room settings. */
    public MatchSettings(Duration leadIn, Duration window, Duration closeGrace, Duration revealHold) {
        this(leadIn, window, closeGrace, revealHold, DEFAULT_GRACE);
    }

    public MatchSettings(Duration leadIn, Duration window, Duration closeGrace, Duration revealHold,
            Duration grace) {
        this(leadIn, window, closeGrace, revealHold, grace, DEFAULT_ROOM_REVEAL_HOLD, DEFAULT_SCOREBOARD_COALESCE);
    }

    /** The pause after a reveal, per mode: rooms hold longer than 1v1. */
    public Duration revealHoldFor(MatchMode mode) {
        return mode == MatchMode.BATTLE_ROOM ? roomRevealHold : revealHold;
    }

    /** The scoreboard coalescing window, per mode: only rooms coalesce (zero otherwise). */
    public Duration scoreboardCoalesceFor(MatchMode mode) {
        return mode == MatchMode.BATTLE_ROOM ? scoreboardCoalesce : Duration.ZERO;
    }
}
