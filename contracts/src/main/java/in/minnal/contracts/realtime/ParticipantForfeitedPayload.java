package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * {@code PARTICIPANT_FORFEITED} (broadcast): a participant left the match, after the reconnect grace
 * or by Leave (Story 1.9). She keeps the points she earned and scores 0 on the rest.
 *
 * @param questionIndex the question that was open (or last opened) when she forfeited
 */
public record ParticipantForfeitedPayload(UUID participantId, int questionIndex) {
}
