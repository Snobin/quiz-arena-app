package in.minnal.game.match.domain;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The minimal match-actor shell (Story 1.6): what a match will need, held in memory with no
 * behaviour yet. Story 1.7 replaces it with the full match actor.
 *
 * @param participants  every participant, in pairing order (bots included)
 * @param humans        each human's {@code sub} → her participant id (never sent to clients)
 * @param questions     the drawn set, answers included (AD-5: never leaves the server)
 * @param queueWaitMs   each human's {@code sub} → her wait in the queue
 * @param ratings       every participant's id → the rating she plays at (a bot plays at its human's)
 */
public record MatchShell(
        UUID matchId,
        MatchMode mode,
        List<Participant> participants,
        Map<String, UUID> humans,
        List<InternalQuestion> questions,
        Map<String, Long> queueWaitMs,
        Map<UUID, Integer> ratings,
        Instant createdAt) {

    public MatchShell {
        participants = List.copyOf(participants);
        humans = Map.copyOf(humans);
        questions = List.copyOf(questions);
        queueWaitMs = Map.copyOf(queueWaitMs);
        ratings = Map.copyOf(ratings);
    }
}
