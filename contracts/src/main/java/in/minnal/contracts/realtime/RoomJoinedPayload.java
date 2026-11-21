package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * {@code ROOM_JOINED} (private, {@code refSeq} = the last lobby {@code seq} it reflects): the receiver is in the
 * room. Sent on create and again to a host who reconnects.
 *
 * @param code              the canonical 6 characters, no hyphen; shown as {@code XXX-XXX}
 * @param selfParticipantId which participant the receiver is
 */
public record RoomJoinedPayload(UUID roomId, String code, RoomRole role, UUID selfParticipantId, RoomView room) {
}
