package in.minnal.contracts.realtime;

/** The phase a {@link RoomLobbyUpdatedPayload} reports: the lobby is open, or the host's start is fetching the set. */
public enum RoomLobbyPhase {
    LOBBY,
    STARTING
}
