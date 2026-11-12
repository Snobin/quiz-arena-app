package in.minnal.game.platform.session;

import in.minnal.contracts.realtime.MatchMode;
import java.util.UUID;

/** What a player ({@code sub}) is doing right now: at most one of these at a time (AD-11). */
public sealed interface Activity {

    /** Waiting in (or being paired by) the matchmaking queue of {@code mode}. */
    record Queued(MatchMode mode) implements Activity {
    }

    /** Playing match {@code matchId}. */
    record InMatch(UUID matchId) implements Activity {
    }
}
