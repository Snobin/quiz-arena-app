package in.minnal.game.match.domain;

import in.minnal.contracts.realtime.Participant;
import java.util.Arrays;
import java.util.Optional;
import java.util.UUID;

/**
 * One participant's state in a match. Every participant, human or bot, is one of these in
 * {@link MatchState#participants()}; nothing in the match is per player A or B.
 *
 * <p>Mutable and confined to the match actor's thread.
 */
public final class MatchParticipant {

    private final Participant participant;
    private final String sub;
    private final int rating;
    private final RecordedAnswer[] answers;
    private Connection connection;
    private boolean forfeited;
    private int score;

    /**
     * @param sub the player's {@code sub}, or null for a bot
     */
    public MatchParticipant(Participant participant, String sub, int rating, int questionCount, Connection connection) {
        this.participant = participant;
        this.sub = sub;
        this.rating = rating;
        this.answers = new RecordedAnswer[questionCount];
        this.connection = connection;
    }

    public Participant participant() {
        return participant;
    }

    public UUID participantId() {
        return participant.participantId();
    }

    /** The player's {@code sub}; empty for a bot. */
    public Optional<String> sub() {
        return Optional.ofNullable(sub);
    }

    public int rating() {
        return rating;
    }

    public Connection connection() {
        return connection;
    }

    /** Always false until Story 1.9 adds forfeits. */
    public boolean forfeited() {
        return forfeited;
    }

    public int score() {
        return score;
    }

    /** Her answer to question {@code index}, if she gave one in time. */
    public Optional<RecordedAnswer> answer(int index) {
        return Optional.ofNullable(answers[index]);
    }

    /** A copy of every answer slot (null where she did not answer). */
    public RecordedAnswer[] answers() {
        return Arrays.copyOf(answers, answers.length);
    }

    void record(int index, RecordedAnswer answer) {
        answers[index] = answer;
    }

    void addPoints(int points) {
        score += points;
    }

    void connection(Connection connection) {
        this.connection = connection;
    }
}
