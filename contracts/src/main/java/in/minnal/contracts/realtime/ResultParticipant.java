package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * One participant's final standing in a {@link MatchEndedPayload}.
 *
 * @param score        her total over the questions asked
 * @param correctCount how many of them she answered correctly
 * @param forfeited    whether she left the match (ranked on the score she earned)
 * @param placement    1-based, from {@code Ranking}; tied participants share a placement (1, 1, 3)
 */
public record ResultParticipant(
        UUID participantId,
        String displayName,
        ParticipantKind kind,
        int score,
        int correctCount,
        boolean forfeited,
        int placement) {
}
