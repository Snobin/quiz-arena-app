package in.minnal.game.match.domain;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.AnswerAcceptedPayload;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ErrorPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantResult;
import in.minnal.contracts.realtime.QuestionRevealedPayload;
import in.minnal.contracts.realtime.QuestionStartedPayload;
import in.minnal.contracts.realtime.QuestionView;
import in.minnal.contracts.realtime.ScoreboardPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.contracts.scoring.Scoring;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Predicate;

/**
 * The rules of one live match, driven by the instants it is given (AD-5, AD-6): no threads, no
 * timers and no I/O, so every timing rule is testable on a controllable clock. The match actor owns
 * one, feeds it its events in order and sends the messages it returns.
 *
 * <p>It holds {@code participants: List<MatchParticipant>} and every rule iterates that list: two
 * players or fifty are the same code. Broadcasts it returns are numbered by one {@code seq} (1, 2,
 * 3…); private replies carry {@code refSeq}, the last broadcast {@code seq}.
 *
 * <p>The mode decides only the shape of {@code ANSWER_ACCEPTED} ({@link MatchMode#revealsOwnAnswerAtAck()}):
 * in 1v1 modes it carries the sender's own result; in Battle Room it is a receipt (AD-5, Story 1.11).
 *
 * <p>Confined to the actor's thread; not thread-safe.
 */
public final class MatchState {

    /** Valid option indexes are {@code 0..OPTION_COUNT-1}. */
    public static final int OPTION_COUNT = 4;

    private final UUID matchId;
    private final MatchMode mode;
    private final List<MatchParticipant> participants;
    private final Map<UUID, MatchParticipant> byId = new LinkedHashMap<>();
    private final List<InternalQuestion> questions;
    private final Duration window;
    private final List<UUID> answered = new ArrayList<>();

    private MatchPhase phase = MatchPhase.LEAD_IN;
    private int current = -1;
    private Instant startedAt;
    private Instant deadline;
    private long seq;

    public MatchState(UUID matchId, MatchMode mode, List<MatchParticipant> participants, List<InternalQuestion> questions,
            Duration window) {
        if (participants.isEmpty() || questions.isEmpty()) {
            throw new IllegalArgumentException("a match needs participants and questions");
        }
        this.matchId = matchId;
        this.mode = mode;
        this.participants = List.copyOf(participants);
        this.questions = List.copyOf(questions);
        this.window = window;
        for (MatchParticipant participant : this.participants) {
            byId.put(participant.participantId(), participant);
        }
    }

    /**
     * The state a {@link MatchSetup} starts in.
     *
     * @param connected whether a human {@code sub} has an open session right now
     */
    public static MatchState of(MatchSetup setup, Duration window, Predicate<String> connected) {
        Map<UUID, String> subs = new LinkedHashMap<>();
        setup.humans().forEach((sub, participantId) -> subs.put(participantId, sub));
        List<MatchParticipant> participants = new ArrayList<>();
        for (Participant participant : setup.participants()) {
            String sub = subs.get(participant.participantId());
            // A participant without a sub (a bot) has no session to lose.
            boolean online = sub == null || connected.test(sub);
            participants.add(new MatchParticipant(participant, sub,
                    setup.ratings().getOrDefault(participant.participantId(), 1200), setup.questions().size(),
                    online ? Connection.CONNECTED : Connection.DISCONNECTED));
        }
        return new MatchState(setup.matchId(), setup.mode(), participants, setup.questions(), window);
    }

    // -----------------------------------------------------------------------------------------
    // Transitions

    /**
     * Opens question {@code index}: {@code startedAt = now}, {@code deadline = now + window}.
     *
     * @return the {@code QUESTION_STARTED} broadcast (no answer data)
     * @throws IllegalStateException unless {@code index} is the next question and none is open
     */
    public ServerMessage<QuestionStartedPayload> startQuestion(int index, Instant now) {
        if ((phase != MatchPhase.LEAD_IN && phase != MatchPhase.REVEALED) || index != current + 1 || index >= total()) {
            throw new IllegalStateException("cannot start question " + index + " in " + phase + " at " + current);
        }
        current = index;
        phase = MatchPhase.QUESTION_OPEN;
        startedAt = now;
        deadline = now.plus(window);
        answered.clear();
        QuestionStartedPayload payload = new QuestionStartedPayload(index, total(), startedAt, deadline,
                QuestionView.of(questions.get(index)));
        return ServerMessage.broadcast(MessageType.QUESTION_STARTED, matchId, ++seq, now, payload);
    }

    /** What became of an answer. */
    public sealed interface AnswerOutcome {

        /**
         * Taken: the private ack for the sender (with her own result in 1v1 modes), then the
         * {@code SCOREBOARD} broadcast (who answered, never what).
         */
        record Accepted(ServerMessage<AnswerAcceptedPayload> ack, ServerMessage<ScoreboardPayload> scoreboard,
                RecordedAnswer answer) implements AnswerOutcome {
        }

        /** A second answer to a question already answered: dropped, nothing changes, nothing is sent. */
        record Duplicate() implements AnswerOutcome {
        }

        /** Refused: the private {@code ERROR} for the sender ({@code ANSWER_REJECTED} or {@code NOT_IN_MATCH}). */
        record Rejected(ServerMessage<ErrorPayload> error) implements AnswerOutcome {
        }
    }

    /**
     * An answer that reached the server at {@code receivedAt} (the socket's receive instant, never a
     * client time). Accepted when {@code questionIndex} is the open question, its window is not
     * closed, {@code startedAt ≤ receivedAt ≤ deadline}, {@code optionIndex} is 0–3, and it is the participant's
     * first answer to it; scored then with {@link Scoring#points} on {@code deadline − receivedAt}.
     * In 1v1 modes the ack also carries her correctness, points, the answer index and her total
     * including these points (the score itself is applied at the close).
     *
     * @param now the instant the replies are sent (their {@code serverTime})
     */
    public AnswerOutcome answer(UUID participantId, Integer questionIndex, Integer optionIndex, Instant receivedAt,
            Instant now) {
        MatchParticipant participant = byId.get(participantId);
        if (participant == null) {
            return new AnswerOutcome.Rejected(ServerMessage.error(ErrorCode.NOT_IN_MATCH, matchId, seq, now));
        }
        if (questionIndex != null && questionIndex >= 0 && questionIndex < total()
                && participant.answer(questionIndex).isPresent()) {
            return new AnswerOutcome.Duplicate();
        }
        boolean valid = phase == MatchPhase.QUESTION_OPEN
                && questionIndex != null && questionIndex == current
                && !receivedAt.isBefore(startedAt)
                && !receivedAt.isAfter(deadline)
                && optionIndex != null && optionIndex >= 0 && optionIndex < OPTION_COUNT;
        if (!valid) {
            return new AnswerOutcome.Rejected(ServerMessage.error(ErrorCode.ANSWER_REJECTED, matchId, seq, now));
        }
        boolean correct = optionIndex == questions.get(current).answerIndex();
        long remainingMs = Duration.between(receivedAt, deadline).toMillis();
        RecordedAnswer answer = new RecordedAnswer(optionIndex, receivedAt, Scoring.points(correct, remainingMs));
        participant.record(current, answer);
        answered.add(participantId);
        AnswerAcceptedPayload ackPayload = mode.revealsOwnAnswerAtAck()
                ? AnswerAcceptedPayload.withResult(current, correct, answer.points(),
                        questions.get(current).answerIndex(), participant.score() + answer.points())
                : AnswerAcceptedPayload.receipt(current);
        ServerMessage<AnswerAcceptedPayload> ack = ServerMessage.reply(MessageType.ANSWER_ACCEPTED, matchId, seq, now,
                ackPayload);
        ServerMessage<ScoreboardPayload> scoreboard = ServerMessage.broadcast(MessageType.SCOREBOARD, matchId, ++seq, now,
                new ScoreboardPayload(current, answered));
        return new AnswerOutcome.Accepted(ack, scoreboard, answer);
    }

    /**
     * Closes question {@code index} and reveals it: answer, explanation, attribution and each
     * participant's pick, correctness, points and running total, in participant order. After the
     * last question the match is {@link MatchPhase#ENDED}.
     *
     * @return the {@code QUESTION_REVEALED} broadcast, or empty when {@code index} is not open (a stale timer)
     */
    public Optional<ServerMessage<QuestionRevealedPayload>> closeWindow(int index, Instant now) {
        if (phase != MatchPhase.QUESTION_OPEN || index != current) {
            return Optional.empty();
        }
        InternalQuestion question = questions.get(index);
        List<ParticipantResult> results = new ArrayList<>();
        for (MatchParticipant participant : participants) {
            Optional<RecordedAnswer> answer = participant.answer(index);
            int points = answer.map(RecordedAnswer::points).orElse(0);
            participant.addPoints(points);
            Integer picked = answer.map(RecordedAnswer::pickedIndex).orElse(null);
            results.add(new ParticipantResult(participant.participantId(), picked,
                    picked != null && picked == question.answerIndex(), points, participant.score()));
        }
        phase = index == total() - 1 ? MatchPhase.ENDED : MatchPhase.REVEALED;
        QuestionRevealedPayload payload = new QuestionRevealedPayload(index, total(), question.questionId(),
                question.version(), question.answerIndex(), question.explanation(), question.attribution(), results);
        return Optional.of(ServerMessage.broadcast(MessageType.QUESTION_REVEALED, matchId, ++seq, now, payload));
    }

    /**
     * Whether every participant still in the match (not forfeited; bots and disconnected players
     * included) has an answer for the open question, so it can close at once (AD-6, Story 1.11).
     * False when no question is open.
     */
    public boolean allAnswered() {
        if (phase != MatchPhase.QUESTION_OPEN) {
            return false;
        }
        for (MatchParticipant participant : participants) {
            if (!participant.forfeited() && participant.answer(current).isEmpty()) {
                return false;
            }
        }
        return true;
    }

    /** The participant's last session closed. The match carries on regardless (grace and forfeit: Story 1.9). */
    public void disconnect(UUID participantId) {
        MatchParticipant participant = byId.get(participantId);
        if (participant != null) {
            participant.connection(Connection.DISCONNECTED);
        }
    }

    // -----------------------------------------------------------------------------------------
    // Reads

    public UUID matchId() {
        return matchId;
    }

    public MatchMode mode() {
        return mode;
    }

    public List<MatchParticipant> participants() {
        return participants;
    }

    public Optional<MatchParticipant> participant(UUID participantId) {
        return Optional.ofNullable(byId.get(participantId));
    }

    public MatchPhase phase() {
        return phase;
    }

    /** The open (or last revealed) question index; -1 before Q1. */
    public int currentIndex() {
        return current;
    }

    public int total() {
        return questions.size();
    }

    public InternalQuestion question(int index) {
        return questions.get(index);
    }

    /** Whether another question follows the current one. */
    public boolean hasNextQuestion() {
        return current + 1 < total();
    }

    public Instant startedAt() {
        return startedAt;
    }

    public Instant deadline() {
        return deadline;
    }

    /** The {@code seq} of the last broadcast (0 before the first). */
    public long lastSeq() {
        return seq;
    }

    public Duration window() {
        return window;
    }
}
