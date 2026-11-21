package in.minnal.game.platform.session;

import in.minnal.contracts.realtime.MatchMode;
import java.util.UUID;

/** What a player ({@code sub}) is doing right now: at most one of these at a time (AD-11). */
public sealed interface Activity {

    /** Waiting in (or being paired by) the matchmaking queue of {@code mode} (and {@code topicId} in Topic Duel). */
    record Queued(MatchMode mode, UUID topicId) implements Activity {

        /** A queue with no topic (Quick Match). */
        public Queued(MatchMode mode) {
            this(mode, null);
        }
    }

    /** Playing match {@code matchId}. */
    record InMatch(UUID matchId) implements Activity {
    }

    /** In the lobby of Battle Room {@code roomId} (Story 5.1); a room match moves her to {@link InMatch} in Story 5.4. */
    record InRoom(UUID roomId) implements Activity {
    }
}
