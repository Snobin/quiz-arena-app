package in.minnal.contracts.realtime;

/** {@code ROOM_START_FAILED} (broadcast on {@code /topic/room/{roomId}}): the room is back in {@code LOBBY}. */
public record RoomStartFailedPayload(RoomStartFailedReason reason) {
}
