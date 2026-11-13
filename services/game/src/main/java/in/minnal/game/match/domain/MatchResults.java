package in.minnal.game.match.domain;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.Participant;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * What a match ended with ({@link MatchState#results}): every participant's totals and answers over
 * the questions that were asked. Placement is not decided here (the actor ranks with
 * {@code Ranking}), and nothing here branches on the participant's kind.
 *
 * @param q1StartedAt when Q1 opened, or null if it never did
 * @param asked       the questions that opened, in order (never one that did not)
 * @param entries     one per participant, in participant order
 */
public record MatchResults(Instant q1StartedAt, List<InternalQuestion> asked, List<Entry> entries) {

    public MatchResults {
        asked = List.copyOf(asked);
        entries = List.copyOf(entries);
    }

    /**
     * One participant's totals.
     *
     * @param sub          her {@code sub}, empty for a bot
     * @param score        her total over the asked questions
     * @param correctCount how many asked questions she answered correctly (pick == answer index)
     * @param answers      {@code answers[i]} is her answer to {@code asked[i]}, empty where she did not answer
     */
    public record Entry(Participant participant, Optional<String> sub, int score, int correctCount, boolean forfeited,
            List<Optional<RecordedAnswer>> answers) {

        public Entry {
            answers = List.copyOf(answers);
        }
    }
}
