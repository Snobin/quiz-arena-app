package in.minnal.contracts.realtime;

/** {@code ROOM_CLOSED} (broadcast on {@code /topic/room/{roomId}}, and sent privately to each member): the room is gone. */
public record RoomClosedPayload(RoomClosedReason reason) {
}
