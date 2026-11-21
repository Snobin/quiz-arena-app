package in.minnal.contracts.realtime;

/** {@code ROOM_LOBBY_UPDATED} (broadcast on {@code /topic/room/{roomId}}): the lobby as it now stands. */
public record RoomLobbyUpdatedPayload(RoomView room) {
}
