package in.minnal.contracts.realtime;

import java.util.List;
import java.util.UUID;

/**
 * {@code SCOREBOARD} (broadcast): who has answered the open question so far, in answer order. No
 * option, correctness or score (AD-5).
 *
 * @param answered participant ids
 */
public record ScoreboardPayload(int questionIndex, List<UUID> answered) {

    public ScoreboardPayload {
        answered = List.copyOf(answered);
    }
}
