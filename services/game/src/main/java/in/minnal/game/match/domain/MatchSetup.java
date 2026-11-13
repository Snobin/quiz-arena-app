package in.minnal.game.match.domain;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What a match starts from, as matchmaking formed it.
 *
 * @param participants every participant, in pairing order (bots included)
 * @param humans       each human's {@code sub} → her participant id (never sent to clients)
 * @param questions    the drawn set, answers included (AD-5: never leaves the server as is)
 * @param queueWaitMs  each human's {@code sub} → her wait in the queue
 * @param ratings      every participant's id → the rating she plays at (a bot plays at its human's)
 * @param questionSource where the questions came from (always {@code BANK} until Epic 6)
 */
public record MatchSetup(
        UUID matchId,
        MatchMode mode,
        List<Participant> participants,
        Map<String, UUID> humans,
        List<InternalQuestion> questions,
        Map<String, Long> queueWaitMs,
        Map<UUID, Integer> ratings,
        Instant createdAt,
        QuestionSource questionSource) {

    /** A setup drawn from the question bank. */
    public MatchSetup(UUID matchId, MatchMode mode, List<Participant> participants, Map<String, UUID> humans,
            List<InternalQuestion> questions, Map<String, Long> queueWaitMs, Map<UUID, Integer> ratings,
            Instant createdAt) {
        this(matchId, mode, participants, humans, questions, queueWaitMs, ratings, createdAt, QuestionSource.BANK);
    }

    public MatchSetup {
        if (questionSource == null) {
            throw new IllegalArgumentException("a match needs a question source");
        }
        participants = List.copyOf(participants);
        humans = Map.copyOf(humans);
        questions = List.copyOf(questions);
        queueWaitMs = Map.copyOf(queueWaitMs);
        ratings = Map.copyOf(ratings);
    }
}
