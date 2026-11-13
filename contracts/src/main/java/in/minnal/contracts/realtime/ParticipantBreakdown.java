package in.minnal.contracts.realtime;

import java.util.List;
import java.util.UUID;

/**
 * One participant's answers in a {@link MatchEndedPayload}: {@code answers[i]} is her answer to
 * {@code questions[i]}.
 */
public record ParticipantBreakdown(UUID participantId, List<BreakdownAnswer> answers) {

    public ParticipantBreakdown {
        answers = List.copyOf(answers);
    }
}
