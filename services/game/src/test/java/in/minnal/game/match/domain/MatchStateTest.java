package in.minnal.game.match.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.AnswerAcceptedPayload;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ErrorPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.ParticipantResult;
import in.minnal.contracts.realtime.QuestionRevealedPayload;
import in.minnal.contracts.realtime.QuestionStartedPayload;
import in.minnal.contracts.realtime.ScoreboardPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.domain.MatchState.AnswerOutcome;
import in.minnal.game.support.MutableClock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

/** The match rules on a {@link MutableClock}: no threads, no sleeps; N = 2 and N = 5 through the same list. */
class MatchStateTest {

    static final Duration WINDOW = Duration.ofSeconds(15);
    static final JsonMapper JSON = JsonMapper.builder().build();

    final MutableClock clock = new MutableClock(Instant.parse("2026-11-12T10:00:00Z"));

    static List<InternalQuestion> questions(int count) {
        return IntStream.range(0, count).mapToObj(i -> new InternalQuestion(UUID.randomUUID(), 1, "ചോദ്യം " + i,
                "Question " + i, List.of("a", "b", "c", "d"), i % 4, "explanation " + i, i % 2 == 0 ? "PSC " + i : null))
                .toList();
    }

    /** {@code n} participants: the last one a bot, the others guests "p0", "p1"… with sub = name. */
    static MatchSetup setup(int n) {
        return setup(n, MatchMode.QUICK);
    }

    static MatchSetup setup(int n, MatchMode mode) {
        List<Participant> participants = new ArrayList<>();
        Map<String, UUID> humans = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) {
            UUID id = UUID.randomUUID();
            boolean bot = i == n - 1;
            participants.add(new Participant(id, bot ? "Minnal Bot" : "p" + i, bot ? ParticipantKind.BOT : ParticipantKind.GUEST));
            if (!bot) {
                humans.put("p" + i, id);
            }
        }
        return new MatchSetup(UUID.randomUUID(), mode, participants, humans, questions(10), Map.of(), Map.of(),
                Instant.EPOCH);
    }

    MatchState state(int n) {
        return MatchState.of(setup(n), WINDOW, sub -> true);
    }

    static UUID id(MatchState state, int i) {
        return state.participants().get(i).participantId();
    }

    static int answerOf(MatchState state) {
        return state.question(state.currentIndex()).answerIndex();
    }

    static int wrongOf(MatchState state) {
        return (answerOf(state) + 1) % 4;
    }

    AnswerOutcome answer(MatchState state, int participant, Integer question, Integer option) {
        return state.answer(id(state, participant), question, option, clock.instant(), clock.instant());
    }

    @Test
    void questionStartedCarriesTheWindowAndNoAnswerData() throws Exception {
        MatchState state = state(2);
        assertThat(state.phase()).isEqualTo(MatchPhase.LEAD_IN);
        ServerMessage<QuestionStartedPayload> started = state.startQuestion(0, clock.instant());

        assertThat(started.type()).isEqualTo(MessageType.QUESTION_STARTED);
        assertThat(started.seq()).isEqualTo(1);
        assertThat(started.refSeq()).isNull();
        assertThat(started.matchId()).isEqualTo(state.matchId());
        QuestionStartedPayload payload = started.payload();
        assertThat(payload.questionIndex()).isZero();
        assertThat(payload.total()).isEqualTo(10);
        assertThat(payload.startedAt()).isEqualTo(clock.instant());
        assertThat(payload.deadline()).isEqualTo(clock.instant().plusSeconds(15));
        assertThat(payload.question().questionId()).isEqualTo(state.question(0).questionId());
        assertThat(payload.question().textEn()).isEqualTo("Question 0");
        String json = JSON.writeValueAsString(started);
        assertThat(json).doesNotContain("answerIndex").doesNotContain("explanation").doesNotContain("attribution")
                .doesNotContain("correct");
    }

    @ParameterizedTest(name = "N = {0}")
    @ValueSource(ints = {2, 5})
    void aWholeMatchScoresEveryParticipantThroughTheList(int n) {
        MatchState state = state(n);
        int[] expected = new int[n];
        long expectedSeq = 0;
        for (int q = 0; q < 10; q++) {
            ServerMessage<QuestionStartedPayload> started = state.startQuestion(q, clock.instant());
            assertThat(started.seq()).isEqualTo(++expectedSeq);
            // Participant i answers i seconds in: even ones right, odd ones wrong; the last stays silent on odd questions.
            List<UUID> answeredSoFar = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                if (i == n - 1 && q % 2 == 1) {
                    continue;
                }
                clock.advance(Duration.ofSeconds(1));
                boolean right = i % 2 == 0;
                AnswerOutcome outcome = answer(state, i, q, right ? answerOf(state) : wrongOf(state));
                assertThat(outcome).isInstanceOf(AnswerOutcome.Accepted.class);
                AnswerOutcome.Accepted accepted = (AnswerOutcome.Accepted) outcome;
                long remainingMs = 15_000 - 1_000L * (answeredSoFar.size() + 1);
                int points = right ? (int) (500 + Math.round(500 * remainingMs / 15000.0)) : 0;
                expected[i] += points;
                // The ack reflects the last broadcast; the scoreboard is the next one. QUICK is 1v1:
                // the ack carries her own result and her total including these points.
                assertThat(accepted.ack().refSeq()).isEqualTo(expectedSeq);
                assertThat(accepted.ack().seq()).isNull();
                assertThat(accepted.ack().payload()).isEqualTo(
                        AnswerAcceptedPayload.withResult(q, right, points, answerOf(state), expected[i]));
                assertThat(accepted.scoreboard().seq()).isEqualTo(++expectedSeq);
                answeredSoFar.add(id(state, i));
                assertThat(accepted.scoreboard().payload()).isEqualTo(new ScoreboardPayload(q, answeredSoFar));
            }
            clock.advance(Duration.ofSeconds(15));
            ServerMessage<QuestionRevealedPayload> reveal = state.closeWindow(q, clock.instant()).orElseThrow();
            assertThat(reveal.seq()).isEqualTo(++expectedSeq);
            QuestionRevealedPayload payload = reveal.payload();
            assertThat(payload.questionIndex()).isEqualTo(q);
            assertThat(payload.total()).isEqualTo(10);
            assertThat(payload.questionId()).isEqualTo(state.question(q).questionId());
            assertThat(payload.answerIndex()).isEqualTo(state.question(q).answerIndex());
            assertThat(payload.explanation()).isEqualTo("explanation " + q);
            assertThat(payload.attribution()).isEqualTo(q % 2 == 0 ? "PSC " + q : null);
            assertThat(payload.results()).hasSize(n);
            for (int i = 0; i < n; i++) {
                ParticipantResult result = payload.results().get(i);
                assertThat(result.participantId()).isEqualTo(id(state, i));
                assertThat(result.totalScore()).isEqualTo(expected[i]);
                if (i == n - 1 && q % 2 == 1) {
                    assertThat(result.pickedIndex()).isNull();
                    assertThat(result.correct()).isFalse();
                    assertThat(result.points()).isZero();
                } else {
                    assertThat(result.correct()).isEqualTo(i % 2 == 0);
                    assertThat(result.points() > 0).isEqualTo(i % 2 == 0);
                }
            }
            assertThat(state.phase()).isEqualTo(q == 9 ? MatchPhase.ENDED : MatchPhase.REVEALED);
            assertThat(state.hasNextQuestion()).isEqualTo(q < 9);
        }
        for (int i = 0; i < n; i++) {
            assertThat(state.participants().get(i).score()).isEqualTo(expected[i]);
            assertThat(state.participants().get(i).forfeited()).isFalse();
        }
        // After the last reveal nothing opens again.
        assertThatThrownBy(() -> state.startQuestion(10, clock.instant())).isInstanceOf(IllegalStateException.class);
    }

    /** Story 1.11: the 1v1 ack carries her result; the total counts these points once, not twice. */
    @Test
    void aOneVersusOneAckCarriesTheOwnResultAndARunningTotalWithoutDoubleCounting() throws Exception {
        MatchState state = state(2);
        state.startQuestion(0, clock.instant());
        // Correct with 7.5 s left: 750.
        AnswerOutcome.Accepted first = (AnswerOutcome.Accepted) state.answer(id(state, 0), 0, answerOf(state),
                state.deadline().minusMillis(7_500), clock.instant());
        assertThat(first.ack().payload()).isEqualTo(AnswerAcceptedPayload.withResult(0, true, 750, answerOf(state), 750));
        // The score itself is applied only at the close.
        assertThat(state.participants().get(0).score()).isZero();
        String scoreboardJson = JSON.writeValueAsString(first.scoreboard());
        assertThat(scoreboardJson).as("the opponent's frame says who answered, never what")
                .doesNotContain("correct").doesNotContain("points").doesNotContain("answerIndex")
                .doesNotContain("pickedIndex").doesNotContain("totalScore");
        state.closeWindow(0, clock.instant());
        assertThat(state.participants().get(0).score()).isEqualTo(750);

        clock.advance(Duration.ofSeconds(3));
        state.startQuestion(1, clock.instant());
        AnswerOutcome.Accepted right = (AnswerOutcome.Accepted) state.answer(id(state, 0), 1, answerOf(state),
                state.deadline().minusMillis(15_000), clock.instant());
        assertThat(right.ack().payload()).isEqualTo(AnswerAcceptedPayload.withResult(1, true, 1000, answerOf(state), 1750));
        AnswerOutcome.Accepted wrong = (AnswerOutcome.Accepted) state.answer(id(state, 1), 1, wrongOf(state),
                state.deadline().minusMillis(1_000), clock.instant());
        assertThat(wrong.ack().payload()).isEqualTo(AnswerAcceptedPayload.withResult(1, false, 0, answerOf(state), 0));
        // The reveal's numbers equal the acks'.
        List<ParticipantResult> results = state.closeWindow(1, clock.instant()).orElseThrow().payload().results();
        assertThat(results).extracting(ParticipantResult::totalScore).containsExactly(1750, 0);
        assertThat(results).extracting(ParticipantResult::points).containsExactly(1000, 0);
    }

    @Test
    void topicDuelIsOneVersusOneToo() {
        MatchState state = MatchState.of(setup(2, MatchMode.TOPIC_DUEL), WINDOW, sub -> true);
        state.startQuestion(0, clock.instant());
        AnswerOutcome.Accepted accepted = (AnswerOutcome.Accepted) answer(state, 0, 0, wrongOf(state));
        assertThat(accepted.ack().payload().correct()).isFalse();
        assertThat(accepted.ack().payload().answerIndex()).isEqualTo(answerOf(state));
    }

    @Test
    void aBattleRoomAckIsAReceiptOnly() {
        MatchState state = MatchState.of(setup(5, MatchMode.BATTLE_ROOM), WINDOW, sub -> true);
        state.startQuestion(0, clock.instant());
        AnswerOutcome.Accepted accepted = (AnswerOutcome.Accepted) answer(state, 0, 0, answerOf(state));
        assertThat(accepted.ack().payload()).isEqualTo(AnswerAcceptedPayload.receipt(0));
        // On the wire the null result fields are omitted (MatchEarlyCloseFlowTest checks the frame).
        assertThat(accepted.ack().payload().correct()).isNull();
        assertThat(accepted.ack().payload().answerIndex()).isNull();
    }

    @ParameterizedTest(name = "N = {0}")
    @ValueSource(ints = {2, 5})
    void allAnsweredOnlyOnceTheLastParticipantAnswers(int n) {
        MatchState state = state(n);
        assertThat(state.allAnswered()).as("no question open").isFalse();
        state.startQuestion(0, clock.instant());
        for (int i = 0; i < n; i++) {
            assertThat(state.allAnswered()).as("%d of %d answered", i, n).isFalse();
            answer(state, i, 0, i % 4);
        }
        assertThat(state.allAnswered()).isTrue();
        state.closeWindow(0, clock.instant());
        assertThat(state.allAnswered()).as("closed").isFalse();
    }

    @Test
    void aForfeitedParticipantIsNotWaitedForButADisconnectedOneIs() {
        MatchState state = state(3);
        state.disconnect(id(state, 1));
        state.startQuestion(0, clock.instant());
        answer(state, 0, 0, 0);
        answer(state, 2, 0, 0);
        assertThat(state.allAnswered()).as("p1 is disconnected but still in the match").isFalse();
        state.participants().get(1).forfeit();
        assertThat(state.allAnswered()).as("p1 forfeited").isTrue();
    }

    @Test
    void speedScoresAt15000_7500And0MsLeft() {
        MatchState state = state(5);
        state.startQuestion(0, clock.instant());
        Instant deadline = state.deadline();
        int right = answerOf(state);
        state.answer(id(state, 0), 0, right, deadline.minusMillis(15_000), clock.instant());
        state.answer(id(state, 1), 0, right, deadline.minusMillis(7_500), clock.instant());
        state.answer(id(state, 2), 0, right, deadline, clock.instant());
        state.answer(id(state, 3), 0, wrongOf(state), deadline.minusMillis(15_000), clock.instant());
        // Participant 4 does not answer.
        List<ParticipantResult> results = state.closeWindow(0, deadline.plusMillis(50)).orElseThrow().payload().results();
        assertThat(results).extracting(ParticipantResult::points).containsExactly(1000, 750, 500, 0, 0);
        assertThat(results).extracting(ParticipantResult::pickedIndex).containsExactly(right, right, right, wrongOf(state), null);
    }

    @Test
    void onlyTheFirstAnswerCounts() {
        MatchState state = state(2);
        state.startQuestion(0, clock.instant());
        assertThat(answer(state, 0, 0, wrongOf(state))).isInstanceOf(AnswerOutcome.Accepted.class);
        long seq = state.lastSeq();
        clock.advance(Duration.ofSeconds(1));
        assertThat(answer(state, 0, 0, answerOf(state))).isInstanceOf(AnswerOutcome.Duplicate.class);
        assertThat(state.lastSeq()).as("a duplicate broadcasts nothing").isEqualTo(seq);
        ParticipantResult result = state.closeWindow(0, clock.instant()).orElseThrow().payload().results().get(0);
        assertThat(result.pickedIndex()).isEqualTo(wrongOf(state));
        assertThat(result.points()).isZero();
        // Even after the reveal, a repeat for that question is still a silent duplicate.
        assertThat(answer(state, 0, 0, answerOf(state))).isInstanceOf(AnswerOutcome.Duplicate.class);
    }

    @Test
    void lateWrongIndexAndBadOptionAreRejectedWithRefSeq() {
        MatchState state = state(2);
        // Before Q1 opens.
        assertRejected(answer(state, 0, 0, 0), ErrorCode.ANSWER_REJECTED, 0);
        state.startQuestion(0, clock.instant());
        Instant deadline = state.deadline();
        assertRejected(answer(state, 0, 1, 0), ErrorCode.ANSWER_REJECTED, 1); // another question
        assertRejected(answer(state, 0, -1, 0), ErrorCode.ANSWER_REJECTED, 1);
        assertRejected(answer(state, 0, null, 0), ErrorCode.ANSWER_REJECTED, 1);
        assertRejected(answer(state, 0, 0, 5), ErrorCode.ANSWER_REJECTED, 1); // option 5
        assertRejected(answer(state, 0, 0, -1), ErrorCode.ANSWER_REJECTED, 1);
        assertRejected(answer(state, 0, 0, null), ErrorCode.ANSWER_REJECTED, 1);
        // Stamped 1 ms after the deadline, even though the window is not closed yet.
        assertRejected(state.answer(id(state, 0), 0, 0, deadline.plusMillis(1), deadline.plusMillis(2)),
                ErrorCode.ANSWER_REJECTED, 1);
        // Stamped exactly at the deadline: still in time (500 points if right).
        assertThat(state.answer(id(state, 1), 0, answerOf(state), deadline, deadline))
                .isInstanceOf(AnswerOutcome.Accepted.class);
        state.closeWindow(0, deadline.plusMillis(50));
        // After the close, even a stamp inside the window is rejected.
        assertRejected(state.answer(id(state, 0), 0, 0, deadline.minusMillis(1), deadline.plusMillis(60)),
                ErrorCode.ANSWER_REJECTED, 3);
        // Someone who is not in the match.
        assertRejected(state.answer(UUID.randomUUID(), 0, 0, clock.instant(), clock.instant()), ErrorCode.NOT_IN_MATCH, 3);
        // Nothing rejected was recorded.
        assertThat(state.participants().get(0).answer(0)).isEmpty();
    }

    @Test
    void anAnswerStampedBeforeTheQuestionOpenedIsRejected() {
        MatchState state = state(2);
        state.startQuestion(0, clock.instant());
        state.closeWindow(0, clock.instant().plusSeconds(15));
        // A guess for Q1 sent during the reveal hold: stamped before Q1 opens, queued after it.
        Instant guessedAt = clock.instant().plusSeconds(16);
        clock.advance(Duration.ofSeconds(17));
        state.startQuestion(1, clock.instant());
        assertRejected(state.answer(id(state, 0), 1, answerOf(state), guessedAt, clock.instant()),
                ErrorCode.ANSWER_REJECTED, 3);
        assertThat(state.participants().get(0).answer(1)).isEmpty();
        // Stamped exactly at startedAt: in time, with the whole window left.
        AnswerOutcome atStart = state.answer(id(state, 1), 1, answerOf(state), state.startedAt(), clock.instant());
        assertThat(((AnswerOutcome.Accepted) atStart).answer().points()).isEqualTo(1000);
    }

    static void assertRejected(AnswerOutcome outcome, ErrorCode code, long refSeq) {
        assertThat(outcome).isInstanceOf(AnswerOutcome.Rejected.class);
        ServerMessage<ErrorPayload> error = ((AnswerOutcome.Rejected) outcome).error();
        assertThat(error.type()).isEqualTo(MessageType.ERROR);
        assertThat(error.payload().code()).isEqualTo(code);
        assertThat(error.refSeq()).isEqualTo(refSeq);
        assertThat(error.seq()).isNull();
    }

    @Test
    void aStaleCloseIsIgnoredAndQuestionsOpenOnlyInOrder() {
        MatchState state = state(2);
        assertThatThrownBy(() -> state.startQuestion(1, clock.instant())).isInstanceOf(IllegalStateException.class);
        state.startQuestion(0, clock.instant());
        assertThatThrownBy(() -> state.startQuestion(1, clock.instant())).as("Q0 still open")
                .isInstanceOf(IllegalStateException.class);
        assertThat(state.closeWindow(1, clock.instant())).isEmpty();
        assertThat(state.closeWindow(0, clock.instant())).isPresent();
        assertThat(state.closeWindow(0, clock.instant())).as("closed once").isEmpty();
        assertThat(state.lastSeq()).isEqualTo(2);
    }

    @Test
    void aDisconnectOnlyMarksTheParticipant() {
        MatchSetup setup = setup(3);
        MatchState state = MatchState.of(setup, WINDOW, sub -> !sub.equals("p1"));
        assertThat(state.participants()).extracting(MatchParticipant::connection)
                .containsExactly(Connection.CONNECTED, Connection.DISCONNECTED, Connection.CONNECTED);
        assertThat(state.participants()).extracting(p -> p.sub().orElse(null)).containsExactly("p0", "p1", null);
        state.disconnect(id(state, 0));
        assertThat(state.participants().get(0).connection()).isEqualTo(Connection.DISCONNECTED);
        // The match goes on: Q1 opens and the bot still answers.
        state.startQuestion(0, clock.instant());
        assertThat(answer(state, 2, 0, answerOf(state))).isInstanceOf(AnswerOutcome.Accepted.class);
    }
}
