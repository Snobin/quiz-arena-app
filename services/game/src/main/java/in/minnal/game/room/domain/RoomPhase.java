package in.minnal.game.room.domain;

/**
 * A room's life: {@code LOBBY -> STARTING -> IN_MATCH -> ENDED}. {@code STARTING} is a step of the lobby (the host's
 * start is fetching the question set) and falls back to {@code LOBBY} when the start does not go ahead (Story 5.4).
 */
public enum RoomPhase {
    LOBBY,
    STARTING,
    IN_MATCH,
    ENDED
}
