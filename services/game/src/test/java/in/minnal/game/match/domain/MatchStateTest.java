package in.minnal.game.match.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.AbortReason;
import in.minnal.contracts.realtime.AnswerAcceptedPayload;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ErrorPayload;
import in.minnal.contracts.realtime.MatchAbortedPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.MyAnswer;
import in.minnal.contracts.realtime.ParticipantForfeitedPayload;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.ParticipantScore;
import in.minnal.contracts.realtime.ParticipantResult;
import in.minnal.contracts.realtime.QuestionRevealedPayload;
import in.minnal.contracts.realtime.QuestionStartedPayload;
import in.minnal.contracts.realtime.ScoreboardPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.contracts.realtime.SnapshotPayload;
import in.minnal.contracts.realtime.SnapshotPhase;
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
    void theSnapshotCarriesTheTopicOfATopicDuelAndNothingInQuick() {
        MatchSetup base = setup(2, MatchMode.TOPIC_DUEL);
        in.minnal.contracts.realtime.TopicInfo topic = new in.minnal.contracts.realtime.TopicInfo(UUID.randomUUID(), "Kerala History", "History");
        MatchSetup duel = new MatchSetup(base.matchId(), base.mode(), base.participants(), base.humans(), base.questions(),
                base.queueWaitMs(), base.ratings(), base.createdAt(), base.questionSource(), topic);
        MatchState state = MatchState.of(duel, WINDOW, sub -> true);
        assertThat(state.snapshot(id(state, 0), clock.instant()).payload().topic()).isEqualTo(topic);
        MatchState quick = state(2);
        assertThat(quick.snapshot(id(quick, 0), clock.instant()).payload().topic()).isNull();
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

    // -----------------------------------------------------------------------------------------
    // Story 1.9: forfeit, reconnect, snapshot

    @ParameterizedTest(name = "N = {0}")
    @ValueSource(ints = {2, 5})
    void aForfeitKeepsTheEarnedScoreRejectsLaterAnswersAndIsIdempotent(int n) {
        MatchState state = state(n);
        state.startQuestion(0, clock.instant());
        answer(state, 0, 0, answerOf(state));
        state.closeWindow(0, clock.instant());
        int earned = state.participants().get(0).score();
        assertThat(earned).isPositive();
        state.startQuestion(1, clock.instant());

        ServerMessage<ParticipantForfeitedPayload> forfeited = state.forfeit(id(state, 0), clock.instant()).orElseThrow();
        assertThat(forfeited.type()).isEqualTo(MessageType.PARTICIPANT_FORFEITED);
        assertThat(forfeited.seq()).isEqualTo(state.lastSeq());
        assertThat(forfeited.payload()).isEqualTo(new ParticipantForfeitedPayload(id(state, 0), 1));
        assertThat(state.forfeit(id(state, 0), clock.instant())).as("idempotent").isEmpty();
        assertThat(state.forfeit(UUID.randomUUID(), clock.instant())).as("unknown").isEmpty();

        assertRejected(answer(state, 0, 1, answerOf(state)), ErrorCode.ANSWER_REJECTED, state.lastSeq());
        for (int q = 1; q < 10; q++) {
            if (q > 1) {
                state.startQuestion(q, clock.instant());
            }
            state.closeWindow(q, clock.instant());
        }
        assertThat(state.participants().get(0).score()).as("earned score kept, rest 0").isEqualTo(earned);
    }

    @ParameterizedTest(name = "N = {0}")
    @ValueSource(ints = {2, 5})
    void allAnsweredIgnoresTheForfeitedAndIsFalseWhenNobodyIsLeft(int n) {
        MatchState state = state(n);
        state.startQuestion(0, clock.instant());
        for (int i = 1; i < n; i++) {
            answer(state, i, 0, 0);
        }
        assertThat(state.allAnswered()).isFalse();
        state.forfeit(id(state, 0), clock.instant());
        assertThat(state.allAnswered()).as("the only one missing forfeited").isTrue();
        for (int i = 1; i < n; i++) {
            state.participants().get(i).forfeit();
        }
        assertThat(state.allAnswered()).as("nobody left").isFalse();
    }

    @ParameterizedTest(name = "N = {0}")
    @ValueSource(ints = {2, 5})
    void humansAllForfeitedCountsHumansOnlyAndQ1RevealedMarksCompletion(int n) {
        MatchState state = state(n);
        assertThat(state.q1Revealed()).isFalse();
        for (int i = 0; i < n - 1; i++) {
            assertThat(state.humansAllForfeited()).isFalse();
            state.forfeit(id(state, i), clock.instant());
        }
        assertThat(state.humansAllForfeited()).as("the bot does not count").isTrue();
        state.startQuestion(0, clock.instant());
        state.closeWindow(0, clock.instant());
        assertThat(state.q1Revealed()).isTrue();
    }

    @Test
    void anAbortEndsTheMatchWithItsReason() {
        MatchState state = state(2);
        ServerMessage<MatchAbortedPayload> aborted = state.abort(AbortReason.ALL_LEFT, clock.instant());
        assertThat(aborted.type()).isEqualTo(MessageType.MATCH_ABORTED);
        assertThat(aborted.seq()).isEqualTo(1);
        assertThat(aborted.payload().reason()).isEqualTo(AbortReason.ALL_LEFT);
        assertThat(state.phase()).isEqualTo(MatchPhase.ENDED);
        assertThat(state.forfeit(id(state, 0), clock.instant())).as("nothing after the end").isEmpty();
    }

    @Test
    void finishNowClosesTheOpenQuestionAndScoresTheRestZeroWithoutRevealingThem() {
        MatchState state = state(2);
        state.startQuestion(0, clock.instant());
        answer(state, 1, 0, answerOf(state));
        state.closeWindow(0, clock.instant());
        state.startQuestion(1, clock.instant());
        answer(state, 1, 1, answerOf(state));
        state.forfeit(id(state, 0), clock.instant());
        long before = state.lastSeq();

        QuestionRevealedPayload reveal = state.finishNow(clock.instant()).orElseThrow().payload();
        assertThat(reveal.questionIndex()).isEqualTo(1);
        assertThat(state.lastSeq()).as("only the open question's reveal").isEqualTo(before + 1);
        assertThat(state.phase()).isEqualTo(MatchPhase.ENDED);
        assertThat(state.participants().get(1).answers()).hasSize(10);
        assertThat(state.participants().get(1).score()).isEqualTo(reveal.results().get(1).totalScore());
        assertThat(state.finishNow(clock.instant())).as("nothing open any more").isEmpty();
    }

    @Test
    void disconnectAndReconnectFlipTheConnectionButNotForAForfeitedOne() {
        MatchState state = state(2);
        assertThat(state.disconnect(id(state, 0))).isTrue();
        assertThat(state.participants().get(0).connection()).isEqualTo(Connection.DISCONNECTED);
        state.reconnect(id(state, 0));
        assertThat(state.participants().get(0).connection()).isEqualTo(Connection.CONNECTED);
        state.forfeit(id(state, 0), clock.instant());
        assertThat(state.disconnect(id(state, 0))).isFalse();
    }

    @ParameterizedTest(name = "N = {0}")
    @ValueSource(ints = {2, 5})
    void aSnapshotWhileOpenCarriesTheQuestionButNoAnswerNorAnyOtherPick(int n) throws Exception {
        MatchState state = state(n);
        SnapshotPayload leadIn = state.snapshot(id(state, 0), clock.instant()).payload();
        assertThat(leadIn.phase()).isEqualTo(SnapshotPhase.LEAD_IN);
        assertThat(leadIn.question()).isNull();
        assertThat(leadIn.lastReveal()).isNull();
        assertThat(leadIn.selfParticipantId()).isEqualTo(id(state, 0));

        state.startQuestion(0, clock.instant());
        answer(state, 0, 0, answerOf(state));
        state.closeWindow(0, clock.instant());
        state.startQuestion(1, clock.instant());
        clock.advance(Duration.ofMillis(7_500));
        int answer = answerOf(state);
        int wrong = wrongOf(state);
        answer(state, 0, 1, answer);
        answer(state, 1, 1, wrong);

        ServerMessage<SnapshotPayload> snapshot = state.snapshot(id(state, 0), clock.instant());
        assertThat(snapshot.type()).isEqualTo(MessageType.SNAPSHOT);
        assertThat(snapshot.refSeq()).isEqualTo(state.lastSeq());
        assertThat(snapshot.seq()).isNull();
        SnapshotPayload payload = snapshot.payload();
        assertThat(payload.phase()).isEqualTo(SnapshotPhase.QUESTION_OPEN);
        assertThat(payload.questionIndex()).isEqualTo(1);
        assertThat(payload.total()).isEqualTo(10);
        assertThat(payload.question().questionId()).isEqualTo(state.question(1).questionId());
        assertThat(payload.startedAt()).isEqualTo(state.startedAt());
        assertThat(payload.deadline()).isEqualTo(state.deadline());
        assertThat(payload.lastReveal().questionIndex()).isZero();
        assertThat(payload.answered()).containsExactly(id(state, 0), id(state, 1));
        int q0 = state.participants().get(0).score();
        assertThat(payload.scores()).first().isEqualTo(new ParticipantScore(id(state, 0), q0, false));
        assertThat(payload.participants()).hasSize(n);
        assertThat(payload.youForfeited()).isFalse();
        assertThat(payload.selfParticipantId()).isEqualTo(id(state, 0));
        assertThat(payload.myAnswer()).isEqualTo(MyAnswer.withResult(answer, true, 750, answer, q0 + 750));

        // The other answerer's snapshot carries her own wrong pick only.
        SnapshotPayload other = state.snapshot(id(state, 1), clock.instant()).payload();
        assertThat(other.myAnswer().pickedIndex()).isEqualTo(wrong);
        assertThat(other.myAnswer().correct()).isFalse();
        assertThat(other.selfParticipantId()).isEqualTo(id(state, 1));
        // AD-5: nothing on the wire about anyone else's pick, nor the open question's explanation.
        // p0 picked 0 on Q0 and the answer on Q1; p1's wrong Q1 pick must not appear in p0's snapshot.
        String json = JSON.writeValueAsString(state.snapshot(id(state, 0), clock.instant()));
        assertThat(json).doesNotContain("explanation 1").doesNotContain("\"pickedIndex\":" + wrong);
    }

    @Test
    void aBattleRoomSnapshotHasTheOwnPickWithoutAResult() {
        MatchState state = MatchState.of(setup(3, MatchMode.BATTLE_ROOM), WINDOW, sub -> true);
        state.startQuestion(0, clock.instant());
        answer(state, 0, 0, 2);
        assertThat(state.snapshot(id(state, 0), clock.instant()).payload().myAnswer()).isEqualTo(MyAnswer.receipt(2));
    }

    @Test
    void aSnapshotAfterAForfeitAndInTheHoldSaysSo() {
        MatchState state = state(2);
        state.startQuestion(0, clock.instant());
        state.closeWindow(0, clock.instant());
        state.forfeit(id(state, 0), clock.instant());
        SnapshotPayload payload = state.snapshot(id(state, 0), clock.instant()).payload();
        assertThat(payload.phase()).isEqualTo(SnapshotPhase.REVEAL);
        assertThat(payload.youForfeited()).isTrue();
        assertThat(payload.question()).isNull();
        assertThat(payload.deadline()).isNull();
        assertThat(payload.answered()).isEmpty();
        assertThat(payload.scores().getFirst().forfeited()).isTrue();
    }

    /**
     * Story 1.10: results over every asked question. Participant {@code i} answers right on the
     * questions {@code q} with {@code q % n == i}, wrong otherwise, except the last participant (the
     * bot) who never answers Q0; each answer arrives {@code 1 + i} seconds after the window opened.
     */
    @ParameterizedTest(name = "N = {0}")
    @ValueSource(ints = {2, 5})
    void resultsCarryScoreCorrectCountAnswersAndResponseTimes(int n) {
        MatchState state = state(n);
        Instant q1 = clock.instant();
        for (int q = 0; q < 10; q++) {
            Instant opened = clock.instant();
            state.startQuestion(q, opened);
            for (int i = 0; i < n; i++) {
                if (i == n - 1 && q == 0) {
                    continue;
                }
                int option = q % n == i ? answerOf(state) : wrongOf(state);
                state.answer(id(state, i), q, option, opened.plusSeconds(1 + i), opened.plusSeconds(1 + i));
            }
            clock.advance(Duration.ofSeconds(15));
            state.closeWindow(q, clock.instant());
            clock.advance(Duration.ofSeconds(2));
        }
        MatchResults results = state.results();

        assertThat(results.q1StartedAt()).isEqualTo(q1);
        assertThat(state.q1StartedAt()).isEqualTo(q1);
        assertThat(results.asked()).hasSize(10).extracting(InternalQuestion::questionId)
                .containsExactlyElementsOf(IntStream.range(0, 10).mapToObj(q -> state.question(q).questionId()).toList());
        assertThat(results.entries()).hasSize(n);
        for (int i = 0; i < n; i++) {
            MatchResults.Entry entry = results.entries().get(i);
            int index = i;
            long expectedCorrect = IntStream.range(0, 10).filter(q -> q % n == index).filter(q -> !(index == n - 1 && q == 0))
                    .count();
            assertThat(entry.participant().participantId()).isEqualTo(id(state, i));
            assertThat(entry.correctCount()).as("participant %d", i).isEqualTo((int) expectedCorrect);
            assertThat(entry.score()).isEqualTo(state.participants().get(i).score());
            assertThat(entry.forfeited()).isFalse();
            assertThat(entry.answers()).hasSize(10);
            assertThat(entry.sub().isPresent()).isEqualTo(i < n - 1);
            int expectedScore = 0;
            for (int q = 0; q < 10; q++) {
                if (i == n - 1 && q == 0) {
                    assertThat(entry.answers().get(q)).isEmpty();
                    continue;
                }
                RecordedAnswer answer = entry.answers().get(q).orElseThrow();
                assertThat(answer.responseMs()).isEqualTo(1000L * (1 + i));
                assertThat(answer.pickedIndex() == state.question(q).answerIndex()).isEqualTo(q % n == i);
                expectedScore += answer.points();
            }
            assertThat(entry.score()).isEqualTo(expectedScore);
        }
    }

    /** Story 1.10: after an all-gone finish only the questions that opened are in the results. */
    @Test
    void resultsAfterAnEarlyFinishListOnlyTheAskedQuestionsAndKeepTheForfeit() {
        MatchState state = state(2);
        for (int q = 0; q < 5; q++) {
            state.startQuestion(q, clock.instant());
            if (q < 4) {
                answer(state, 0, q, answerOf(state));
                state.closeWindow(q, clock.instant());
            }
        }
        state.forfeit(id(state, 0), clock.instant());
        state.finishNow(clock.instant());
        MatchResults results = state.results();

        assertThat(state.askedCount()).isEqualTo(5);
        assertThat(results.asked()).hasSize(5);
        MatchResults.Entry human = results.entries().get(0);
        assertThat(human.forfeited()).isTrue();
        assertThat(human.correctCount()).isEqualTo(4);
        assertThat(human.answers()).hasSize(5);
        assertThat(human.answers().get(4)).isEmpty();
        assertThat(human.score()).isEqualTo(4 * 1000);
        assertThat(results.entries().get(1).correctCount()).isZero();
    }

    @Test
    void resultsBeforeQ1HaveNothingAsked() {
        MatchState state = state(2);
        assertThat(state.results().asked()).isEmpty();
        assertThat(state.results().q1StartedAt()).isNull();
    }
}
