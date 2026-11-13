package in.minnal.contracts.events;

import in.minnal.contracts.realtime.ParticipantKind;
import java.util.UUID;

/**
 * One participant of a {@link MatchCompletedEvent} (AD-8).
 *
 * @param userId       the player's {@code sub} for a {@code USER} participant only; null (omitted)
 *                     for guests and bots, so a guest's id is never published
 * @param score        her total over the questions asked
 * @param correctCount how many she answered correctly
 * @param forfeited    whether she left the match (ranked on the score she earned)
 * @param placement    1-based, from {@code Ranking}
 */
public record CompletedParticipant(
        UUID participantId,
        String userId,
        ParticipantKind kind,
        String displayName,
        int score,
        int correctCount,
        boolean forfeited,
        int placement) {
}
