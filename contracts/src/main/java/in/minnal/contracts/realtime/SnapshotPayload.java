package in.minnal.contracts.realtime;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * {@code SNAPSHOT} (private, with {@code refSeq} = the last broadcast {@code seq}): the match as it
 * stands, sent in reply to {@code resync} after a reconnect or a {@code seq} gap (Story 1.9). It
 * never carries another participant's pick, nor the open question's answer or explanation (AD-5),
 * with one exception: the receiver's own accepted 1v1 result in {@code myAnswer}, whose
 * {@code answerIndex} she already had from {@code ANSWER_ACCEPTED} (Story 1.11).
 *
 * @param phase         where the match stands
 * @param questionIndex the open question, or the last one that opened (0 before the first)
 * @param total         how many questions the match asks
 * @param question      only while a question is open
 * @param startedAt     only while a question is open
 * @param deadline      only while a question is open
 * @param lastReveal    the last {@code QUESTION_REVEALED} payload, or null before the first reveal
 * @param answered      who has answered the open question (empty otherwise)
 * @param scores        every participant's total and whether she has forfeited, in participant order
 * @param participants  every participant
 * @param youForfeited  whether the receiver has forfeited
 * @param myAnswer      the receiver's accepted answer to the open question, or null
 * @param selfParticipantId which participant the receiver is (so a client with no prior state,
 *                      such as after a page reload, can tell herself apart)
 * @param topic         the Topic Duel topic, null in Quick Match
 * @param mode          the match's mode, so a client with no prior state (a reload) can tell a Battle Room
 *                      of two from a 1v1; null from an older server
 */
public record SnapshotPayload(
        SnapshotPhase phase,
        int questionIndex,
        int total,
        QuestionView question,
        Instant startedAt,
        Instant deadline,
        QuestionRevealedPayload lastReveal,
        List<UUID> answered,
        List<ParticipantScore> scores,
        List<Participant> participants,
        boolean youForfeited,
        MyAnswer myAnswer,
        UUID selfParticipantId,
        TopicInfo topic,
        MatchMode mode) {

    public SnapshotPayload {
        answered = List.copyOf(answered);
        scores = List.copyOf(scores);
        participants = List.copyOf(participants);
    }
}
