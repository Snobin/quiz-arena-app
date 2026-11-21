package in.minnal.contracts.realtime;

/**
 * {@code ROOM_SUCCEEDED} (Story 5.6): the host of a finished room match played again, and this is the successor lobby.
 * Sent privately to every participant with a session (the envelope names the old room and match) and best effort on
 * {@code /topic/match/{matchId}}; a client that gets both shows one Join button.
 *
 * @param code            the new room's canonical code (6 characters, shown as {@code XXX-XXX})
 * @param hostDisplayName the host's name, unchanged
 * @param source          the same source as the old room
 * @param questionCount   the same question count as the old room
 */
public record RoomSucceededPayload(String code, String hostDisplayName, RoomSource source, int questionCount) {
}
