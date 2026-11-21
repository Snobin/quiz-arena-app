package in.minnal.game.room.application;

import in.minnal.game.room.domain.RoomConfigInput;

/** Everything that can happen to a room: each is one event on its actor's queue (AD-4). */
sealed interface RoomEvent {

    /** The room exists: arm its expiry and tell the host. */
    record Begin() implements RoomEvent {
    }

    /** {@code sub} (from {@code sessionId}) asks to change the source and/or count. */
    record Configure(String sub, String sessionId, RoomConfigInput input) implements RoomEvent {
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

    /** The host's grace timer fired; {@code epoch} says whether it is still the armed one. */
    record GraceExpired(long epoch) implements RoomEvent {
    }

    /** The expiry timer fired. */
    record Expire() implements RoomEvent {
    }

    /** game-service is draining: close at once. */
    record Drain() implements RoomEvent {
    }
}
