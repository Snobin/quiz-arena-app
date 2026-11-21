package in.minnal.game.room.domain;

/** A room's life: {@code LOBBY -> IN_MATCH -> ENDED}. Story 5.1 builds the lobby and its end; matches are Story 5.4. */
public enum RoomPhase {
    LOBBY,
    IN_MATCH,
    ENDED
}
