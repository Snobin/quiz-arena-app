package in.minnal.game.room.application;

import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.game.room.domain.RoomConfigInput;

/** Everything that can happen to a room: each is one event on its actor's queue (AD-4). */
sealed interface RoomEvent {

    /** The room exists: arm its expiry and tell the host. */
    record Begin() implements RoomEvent {
    }

    /** {@code sub} (from {@code sessionId}) asks to change the source and/or count. */
    record Configure(String sub, String sessionId, RoomConfigInput input) implements RoomEvent {
    }

    /**
     * {@code sub} (from {@code sessionId}) joins by code (Story 5.3); the registry has already claimed her {@code sub}
     * for this room (or she is in it already), and the room releases the claim when it refuses her.
     */
    record Join(String sub, String sessionId, String displayName) implements RoomEvent {
    }

    /** {@code sub} (from {@code sessionId}) asks to start the match. */
    record Start(String sub, String sessionId) implements RoomEvent {
    }

    /** {@code sub} (from {@code sessionId}) leaves. */
    record Leave(String sub, String sessionId) implements RoomEvent {
    }

    /** {@code sub}'s last session closed. */
    record Disconnected(String sub) implements RoomEvent {
    }

    /** A new session of {@code sub} opened: her grace is cancelled. */
    record Reconnected(String sub) implements RoomEvent {
    }

    /** A session of {@code sub} subscribed to her private queue: it gets the room as it stands. */
    record Announce(String sub, String sessionId) implements RoomEvent {
    }

    /** {@code sub}'s grace timer fired; {@code epoch} says whether it is still the armed one. */
    record GraceExpired(String sub, long epoch) implements RoomEvent {
    }

    /** The lobby's coalescing window closed: broadcast what changed in it. */
    record Flush() implements RoomEvent {
    }

    /** The expiry timer fired. */
    record Expire() implements RoomEvent {
    }

    /** game-service is draining: close at once. */
    record Drain() implements RoomEvent {
    }

    /** The question-set fetch of a start came back: {@code set} on success, else {@code failure} (Story 5.4). */
    record StartFetched(QuestionSetResponse set, Throwable failure) implements RoomEvent {
    }

    /** The room's match ended: finished, aborted or failed (Story 5.4). */
    record MatchEnded() implements RoomEvent {
    }
}
