package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * One participant's standing in a {@link SnapshotPayload}.
 *
 * @param score     her total over the closed questions
 * @param forfeited whether she has left the match (by the reconnect grace or by Leave)
 */
public record ParticipantScore(UUID participantId, int score, boolean forfeited) {
}
