package in.minnal.contracts.realtime;

import in.minnal.contracts.internal.QuestionSource;
import java.util.List;
import java.util.UUID;

/**
 * {@code MATCH_FOUND}: the pairing formed and its question set is ready (AD-13).
 *
 * @param participants      every participant, the receiver included
 * @param questionCount     how many questions the match will ask
 * @param questionSource    always {@code BANK} until Epic 6
 * @param selfParticipantId which participant the receiver is
 */
public record MatchFoundPayload(
        UUID matchId,
        MatchMode mode,
        List<Participant> participants,
        int questionCount,
        QuestionSource questionSource,
        UUID selfParticipantId) {

    public MatchFoundPayload {
        participants = List.copyOf(participants);
    }
}
