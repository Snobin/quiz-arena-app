package in.minnal.contracts.realtime;

import in.minnal.contracts.internal.QuestionSource;
import java.util.List;
import java.util.UUID;

/**
 * {@code MATCH_ENDED} (private, no {@code seq}): the final standings of a completed match, sent to
 * every human with a live session once the last question is revealed, forfeited ones included
 * (Story 1.10). Correctness and points come from the server only.
 *
 * @param questionSource always {@code BANK} until Epic 6
 * @param participants   every participant with her score, correct count and placement, in participant order
 * @param questions      the questions that were asked, in order (never one that did not open)
 * @param topic          the Topic Duel topic, null in Quick Match
 * @param room           the Battle Room and its host, null (omitted) outside rooms
 * @param breakdown      one per participant, in participant order; {@code answers[i]} lines up with {@code questions[i]}
 */
public record MatchEndedPayload(
        UUID matchId,
        MatchMode mode,
        QuestionSource questionSource,
        List<ResultParticipant> participants,
        List<ResultQuestion> questions,
        List<ParticipantBreakdown> breakdown,
        TopicInfo topic,
        MatchEndedRoom room) {

    /** A payload outside a Battle Room (no room block). */
    public MatchEndedPayload(UUID matchId, MatchMode mode, QuestionSource questionSource,
            List<ResultParticipant> participants, List<ResultQuestion> questions, List<ParticipantBreakdown> breakdown,
            TopicInfo topic) {
        this(matchId, mode, questionSource, participants, questions, breakdown, topic, null);
    }

    public MatchEndedPayload {
        participants = List.copyOf(participants);
        questions = List.copyOf(questions);
        breakdown = List.copyOf(breakdown);
    }
}
