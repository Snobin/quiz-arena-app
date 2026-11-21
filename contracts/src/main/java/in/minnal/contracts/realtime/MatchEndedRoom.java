package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * The Battle Room block of a {@code MATCH_ENDED} (Story 5.5): the room the match was played in and its
 * host. Absent (null, omitted) outside rooms.
 */
public record MatchEndedRoom(UUID roomId, UUID hostParticipantId) {
}
