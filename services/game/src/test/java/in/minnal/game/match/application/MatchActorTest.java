package in.minnal.game.match.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.BreakdownAnswer;
import in.minnal.contracts.realtime.MatchEndedPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.ResultParticipant;
import in.minnal.contracts.realtime.AbortReason;
import in.minnal.contracts.realtime.AnswerAcceptedPayload;
import in.minnal.contracts.realtime.ErrorPayload;
import in.minnal.contracts.realtime.MatchAbortedPayload;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.ParticipantForfeitedPayload;
import in.minnal.contracts.realtime.ParticipantResult;
import in.minnal.contracts.realtime.QuestionRevealedPayload;
import in.minnal.contracts.realtime.QuestionStartedPayload;
import in.minnal.contracts.realtime.ScoreboardPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.contracts.realtime.SnapshotPayload;
import in.minnal.contracts.realtime.SnapshotPhase;
import in.minnal.contracts.scoring.Scoring;
import in.minnal.game.match.application.MatchTestKit.RecordingBroadcaster;
import in.minnal.game.match.application.MatchTestKit.RecordingChannel;
import in.minnal.game.match.application.MatchTestKit.Sent;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.match.domain.MatchState;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.function.Predicate;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class MatchActorTest {

    final RecordingChannel channel = new RecordingChannel();
    final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
    final ScheduledMatchTimers timers = new ScheduledMatchTimers();
    final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    final AtomicReference<MatchActor> endedWith = new AtomicReference<>();
    final List<MatchActor> actors = new ArrayList<>();
    final List<String> released = new CopyOnWriteArrayList<>();
    final List<MatchCompletedEvent> published = new CopyOnWriteArrayList<>();

    @AfterEach
    void stop() {
        actors.forEach(MatchActor::close);
        timers.destroy();
    }

    BotBrain silentBots() {
        return new BotBrain(new BotSettings(Duration.ZERO, Duration.ZERO, 1, 1), new Random(1));
    }

    MatchActor actor(MatchSetup setup, MatchSettings settings, BotBrain bots) {
        return actor(setup, settings, bots, sub -> false);
    }

    MatchActor actor(MatchSetup setup, MatchSettings settings, BotBrain bots, Predicate<String> hasSession) {
        MatchState state = MatchState.of(setup, settings.window(), sub -> true);
        MatchActor actor = new MatchActor(setup, state, settings, Clock.systemUTC(), timers, channel, broadcaster, bots,
                new MatchMetrics(meters), endedWith::set, hasSession, released::add, published::add);
        actors.add(actor);
        return actor;
    }

    @Test
    void anAnswerGetsAReceiptWithRefSeqThenAScoreboardAndRejectionsGoToTheSession() throws Exception {
        MatchSetup setup = MatchTestKit.setup(2, 0, 1);
        MatchActor actor = actor(setup, MatchTestKit.fast(Duration.ofMillis(800)), silentBots());
        assertThat(broadcaster.all).as("nothing before Begin").isEmpty();
        actor.tell(new MatchEvent.Begin());
        ServerMessage<?> started = broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        assertThat(started.seq()).isEqualTo(1);
        QuestionStartedPayload payload = (QuestionStartedPayload) started.payload();
        assertThat(Duration.between(payload.startedAt(), payload.deadline())).isEqualTo(Duration.ofMillis(800));

        UUID h0 = setup.humans().get("h0");
        InternalQuestion question = setup.questions().getFirst();
        actor.tell(new MatchEvent.Answer(h0, 0, question.answerIndex(), Instant.now(), new MatchEvent.ReplyTo("h0", "s0")));
        actor.tell(new MatchEvent.Answer(h0, 0, 3, Instant.now(), new MatchEvent.ReplyTo("h0", "s0"))); // duplicate
        actor.tell(new MatchEvent.Answer(setup.humans().get("h1"), 0, 7, Instant.now(), new MatchEvent.ReplyTo("h1", "s1")));
        ServerMessage<?> scoreboard = broadcaster.next(MessageType.SCOREBOARD, Duration.ofSeconds(2));
        assertThat(scoreboard.seq()).isEqualTo(2);
        assertThat(scoreboard.payload()).isEqualTo(new ScoreboardPayload(0, List.of(h0)));
        await().atMost(Duration.ofSeconds(2)).until(() -> channel.sent.size() == 2);

        Sent ack = channel.to("h0").getFirst();
        assertThat(ack.message().type()).isEqualTo(MessageType.ANSWER_ACCEPTED);
        assertThat(ack.message().refSeq()).isEqualTo(1);
        assertThat(ack.message().seq()).isNull();
        // QUICK is 1v1: the ack carries her own result (Story 1.11).
        AnswerAcceptedPayload ackPayload = (AnswerAcceptedPayload) ack.message().payload();
        assertThat(ackPayload.questionIndex()).isZero();
        assertThat(ackPayload.correct()).isTrue();
        assertThat(ackPayload.answerIndex()).isEqualTo(question.answerIndex());
        assertThat(ackPayload.points()).isBetween(500, 1000);
        assertThat(ackPayload.totalScore()).isEqualTo(ackPayload.points());
        assertThat(channel.to("h0")).as("the duplicate got no reply").hasSize(1);
        Sent rejected = channel.to("h1").getFirst();
        assertThat(rejected.sessionId()).isEqualTo("s1");
        assertThat(((ErrorPayload) rejected.message().payload()).code().name()).isEqualTo("ANSWER_REJECTED");
        assertThat(rejected.message().refSeq()).isEqualTo(2);

        ServerMessage<?> reveal = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(3));
        assertThat(reveal.seq()).isEqualTo(3);
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(meters.get(MatchMetrics.ACK).timer().count()).isEqualTo(1);
        assertThat(meters.get(MatchMetrics.BROADCAST_LAG).tag("type", "SCOREBOARD").timer().count()).isEqualTo(1);
    }

    /**
     * AC: simultaneous answers and the timer expiry always give the same result. Fifty threads
     * answer around the deadline (half stamped just before it, half just after) while the real
     * CloseWindow timer fires; the stamp, not thread timing, decides. Repeated 20 times.
     */
    @Test
    void answersRacingTheDeadlineFromFiftyThreadsAlwaysGiveTheSameResult() throws Exception {
        int n = 50;
        Duration window = Duration.ofMillis(250);
        List<List<ParticipantResult>> outcomes = new ArrayList<>();
        for (int run = 0; run < 20; run++) {
            broadcaster.queue.clear();
            MatchSetup setup = MatchTestKit.setup(n, 0, 1);
            MatchActor actor = actor(setup, MatchTestKit.fast(window), silentBots());
            actor.tell(new MatchEvent.Begin());
            QuestionStartedPayload started = (QuestionStartedPayload) broadcaster
                    .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)).payload();
            Instant deadline = started.deadline();
            int answer = setup.questions().getFirst().answerIndex();

            CountDownLatch go = new CountDownLatch(1);
            CountDownLatch done = new CountDownLatch(n);
            for (int i = 0; i < n; i++) {
                UUID participantId = setup.humans().get("h" + i);
                // h0..h24 stamped 25..1 ms before the deadline; h25..h49 stamped 1..25 ms after it.
                Instant stamp = i < n / 2 ? deadline.minusMillis(n / 2 - i) : deadline.plusMillis(i - n / 2 + 1);
                int option = i % 4;
                String sub = "h" + i;
                Thread.ofPlatform().start(() -> {
                    try {
                        go.await();
                        actor.tell(new MatchEvent.Answer(participantId, 0, option, stamp, new MatchEvent.ReplyTo(sub, sub)));
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                });
            }
            // Release them all just before the deadline; CloseWindow fires 50 ms after it.
            long sleepMs = Duration.between(Instant.now(), deadline).toMillis() - 15;
            if (sleepMs > 0) {
                Thread.sleep(sleepMs);
            }
            go.countDown();
            done.await();
            QuestionRevealedPayload reveal = (QuestionRevealedPayload) broadcaster
                    .next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(3)).payload();

            List<ParticipantResult> results = reveal.results();
            for (int i = 0; i < n; i++) {
                ParticipantResult result = results.get(i);
                if (i < n / 2) {
                    long remainingMs = n / 2 - i;
                    boolean correct = i % 4 == answer;
                    assertThat(result.pickedIndex()).as("run %d h%d", run, i).isEqualTo(i % 4);
                    assertThat(result.points()).as("run %d h%d", run, i).isEqualTo(Scoring.points(correct, remainingMs));
                } else {
                    assertThat(result.pickedIndex()).as("run %d h%d late", run, i).isNull();
                    assertThat(result.points()).isZero();
                }
            }
            // Strip the random ids so runs compare by position.
            outcomes.add(results.stream().map(r -> new ParticipantResult(null, r.pickedIndex(), r.correct(), r.points(),
                    r.totalScore())).toList());
        }
        assertThat(outcomes).allSatisfy(outcome -> assertThat(outcome).isEqualTo(outcomes.getFirst()));
    }

    /**
     * The close grace absorbs in-flight delay up to its length: answers stamped 1 ms before the
     * deadline but reaching the mailbox after it (yet before deadline + grace) still count.
     */
    @Test
    void answersStampedInTimeButArrivingWithinTheGraceAreScored() throws Exception {
        MatchSetup setup = MatchTestKit.setup(3, 0, 1);
        MatchActor actor = actor(setup, new MatchSettings(Duration.ofMillis(10), Duration.ofMillis(300),
                Duration.ofMillis(200), Duration.ofMillis(10)), silentBots());
        actor.tell(new MatchEvent.Begin());
        QuestionStartedPayload started = (QuestionStartedPayload) broadcaster
                .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)).payload();
        Instant deadline = started.deadline();
        int answer = setup.questions().getFirst().answerIndex();
        // Past the deadline, well inside the 200 ms grace.
        Thread.sleep(Math.max(0, Duration.between(Instant.now(), deadline).toMillis() + 60));
        assertThat(Instant.now()).isAfter(deadline);
        for (int i = 0; i < 2; i++) {
            actor.tell(new MatchEvent.Answer(setup.humans().get("h" + i), 0, answer, deadline.minusMillis(1),
                    new MatchEvent.ReplyTo("h" + i, "s" + i)));
        }
        // Stamped after the deadline: rejected even though the window is still open.
        actor.tell(new MatchEvent.Answer(setup.humans().get("h2"), 0, answer, deadline.plusMillis(1),
                new MatchEvent.ReplyTo("h2", "s2")));
        QuestionRevealedPayload reveal = (QuestionRevealedPayload) broadcaster
                .next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2)).payload();
        assertThat(reveal.results()).extracting(ParticipantResult::points).containsExactly(500, 500, 0);
        assertThat(reveal.results()).extracting(ParticipantResult::correct).containsExactly(true, true, false);
        assertThat(channel.to("h2")).singleElement().satisfies(sent ->
                assertThat(((ErrorPayload) sent.message().payload()).code().name()).isEqualTo("ANSWER_REJECTED"));
    }

    /**
     * Story 1.11: once everyone has answered, the question closes at once (well before its
     * deadline), the hold follows, then the next question; the cancelled deadline timer never
     * produces a second reveal.
     */
    @Test
    void whenEveryoneHasAnsweredTheQuestionClosesAtOnceThenHoldsAndMovesOn() throws Exception {
        MatchSetup setup = MatchTestKit.setup(2, 0, 2);
        Duration window = Duration.ofSeconds(3);
        Duration hold = Duration.ofMillis(300);
        MatchActor actor = actor(setup, new MatchSettings(Duration.ofMillis(10), window, Duration.ofMillis(50), hold),
                silentBots());
        actor.tell(new MatchEvent.Begin());
        QuestionStartedPayload q0 = (QuestionStartedPayload) broadcaster
                .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)).payload();
        int answer = setup.questions().getFirst().answerIndex();
        actor.tell(new MatchEvent.Answer(setup.humans().get("h0"), 0, answer, Instant.now(), new MatchEvent.ReplyTo("h0", "s0")));
        actor.tell(new MatchEvent.Answer(setup.humans().get("h1"), 0, answer, Instant.now(), new MatchEvent.ReplyTo("h1", "s1")));

        ServerMessage<?> reveal = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(1));
        assertThat(reveal.serverTime()).as("closed early").isBefore(q0.deadline());
        assertThat(((QuestionRevealedPayload) reveal.payload()).questionIndex()).isZero();
        ServerMessage<?> next = broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        assertThat(Duration.between(reveal.serverTime(), next.serverTime())).as("the reveal hold is kept")
                .isGreaterThanOrEqualTo(hold);
        // Q1 is left to time out: it closes at its own deadline, and Q0's cancelled timer never re-closes Q0.
        QuestionStartedPayload q1 = (QuestionStartedPayload) next.payload();
        ServerMessage<?> second = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(5));
        assertThat(((QuestionRevealedPayload) second.payload()).questionIndex()).isEqualTo(1);
        assertThat(second.serverTime()).isAfterOrEqualTo(q1.deadline());
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED)).hasSize(2);
        assertThat(broadcaster.all).extracting(ServerMessage::seq).containsExactly(1L, 2L, 3L, 4L, 5L, 6L);
    }

    /** A bot that never answers keeps the window open to its deadline. */
    @Test
    void aSilentBotLeavesTheWindowOpenToItsDeadline() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 1);
        MatchActor actor = actor(setup, MatchTestKit.fast(Duration.ofMillis(600)), silentBots());
        actor.tell(new MatchEvent.Begin());
        QuestionStartedPayload started = (QuestionStartedPayload) broadcaster
                .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)).payload();
        actor.tell(new MatchEvent.Answer(setup.humans().get("h0"), 0, 0, Instant.now(), new MatchEvent.ReplyTo("h0", "s0")));
        ServerMessage<?> reveal = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(3));
        assertThat(reveal.serverTime()).isAfterOrEqualTo(started.deadline());
    }

    /**
     * Points are fixed by each answer's own receive time: the same answers score the same whether
     * the question closes early (two humans) or at its deadline (the same two plus a silent bot).
     */
    @Test
    void anEarlyCloseScoresExactlyLikeATimedClose() throws Exception {
        MatchSetup early = MatchTestKit.setup(2, 0, 1);
        MatchSetup timed = MatchTestKit.setup(2, 1, 1);
        List<ParticipantResult> earlyResults = playOneQuestion(early);
        List<ParticipantResult> timedResults = playOneQuestion(timed);
        assertThat(withoutIds(earlyResults)).isEqualTo(withoutIds(timedResults.subList(0, 2)));
        assertThat(earlyResults.get(0).points()).isEqualTo(Scoring.points(true, 600));
        assertThat(earlyResults.get(1).points()).isZero();
    }

    private static List<ParticipantResult> withoutIds(List<ParticipantResult> results) {
        return results.stream().map(r -> new ParticipantResult(null, r.pickedIndex(), r.correct(), r.points(),
                r.totalScore())).toList();
    }

    /** h0 right with 600 ms left, h1 wrong with 400 ms left (stamps relative to the deadline). */
    private List<ParticipantResult> playOneQuestion(MatchSetup setup) throws Exception {
        broadcaster.queue.clear();
        MatchActor actor = actor(setup, MatchTestKit.fast(Duration.ofMillis(1_000)), silentBots());
        actor.tell(new MatchEvent.Begin());
        QuestionStartedPayload started = (QuestionStartedPayload) broadcaster
                .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)).payload();
        int answer = setup.questions().getFirst().answerIndex();
        actor.tell(new MatchEvent.Answer(setup.humans().get("h0"), 0, answer, started.deadline().minusMillis(600),
                new MatchEvent.ReplyTo("h0", "s0")));
        actor.tell(new MatchEvent.Answer(setup.humans().get("h1"), 0, (answer + 1) % 4, started.deadline().minusMillis(400),
                new MatchEvent.ReplyTo("h1", "s1")));
        return ((QuestionRevealedPayload) broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(3))
                .payload()).results();
    }

    /** A guest against a (seeded, never silent) bot: every question closes as soon as both have answered. */
    @Test
    void aGuestAgainstABotClosesEachQuestionOnceBothHaveAnswered() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 10);
        UUID h0 = setup.humans().get("h0");
        BotBrain bots = new BotBrain(new BotSettings(Duration.ofMillis(5), Duration.ofMillis(60), 0.65, 0.0), new Random(7));
        Duration window = Duration.ofSeconds(2);
        MatchActor actor = actor(setup, new MatchSettings(Duration.ofMillis(5), window, Duration.ofMillis(50),
                Duration.ofMillis(20)), bots);
        actor.tell(new MatchEvent.Begin());
        for (int q = 0; q < 10; q++) {
            QuestionStartedPayload started = (QuestionStartedPayload) broadcaster
                    .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(3)).payload();
            assertThat(started.questionIndex()).isEqualTo(q);
            actor.tell(new MatchEvent.Answer(h0, q, 0, Instant.now(), new MatchEvent.ReplyTo("h0", "s0")));
            ServerMessage<?> reveal = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(3));
            QuestionRevealedPayload payload = (QuestionRevealedPayload) reveal.payload();
            assertThat(payload.questionIndex()).isEqualTo(q);
            assertThat(payload.results()).allSatisfy(r -> assertThat(r.pickedIndex()).isNotNull());
            assertThat(reveal.serverTime()).as("Q%d closed early", q).isBefore(started.deadline());
        }
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED)).hasSize(10);
    }

    @Test
    void theBotAnswersThroughTheOrdinaryPathWithVaryingDelaysAndIsScoredByScoring() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 10);
        UUID botId = setup.participants().get(1).participantId();
        // The window is long enough for any delay; a seeded random makes the plays reproducible.
        BotBrain bots = new BotBrain(new BotSettings(Duration.ofMillis(5), Duration.ofMillis(60), 0.65, 0.10), new Random(42));
        MatchActor actor = actor(setup, new MatchSettings(Duration.ofMillis(5), Duration.ofMillis(120), Duration.ofMillis(50),
                Duration.ofMillis(5)), bots);
        actor.tell(new MatchEvent.Begin());
        await().atMost(Duration.ofSeconds(10)).until(() -> endedWith.get() == actor);

        List<ServerMessage<?>> starts = broadcaster.ofType(MessageType.QUESTION_STARTED);
        List<ServerMessage<?>> reveals = broadcaster.ofType(MessageType.QUESTION_REVEALED);
        assertThat(starts).hasSize(10);
        assertThat(reveals).hasSize(10);
        Set<Long> delays = new HashSet<>();
        int wrong = 0;
        int silent = 0;
        int right = 0;
        for (int q = 0; q < 10; q++) {
            QuestionStartedPayload started = (QuestionStartedPayload) starts.get(q).payload();
            QuestionRevealedPayload reveal = (QuestionRevealedPayload) reveals.get(q).payload();
            ParticipantResult bot = reveal.results().get(1);
            assertThat(bot.participantId()).isEqualTo(botId);
            Optional<Integer> picked = Optional.ofNullable(bot.pickedIndex());
            if (picked.isEmpty()) {
                silent++;
                assertThat(bot.points()).isZero();
                continue;
            }
            if (bot.correct()) {
                right++;
                assertThat(bot.points()).isBetween(500, 1000);
            } else {
                wrong++;
                assertThat(bot.points()).isZero();
                assertThat(picked.get()).isNotEqualTo(reveal.answerIndex());
            }
            // Its answer appeared on the scoreboard like a human's, between the start and the reveal.
            List<ServerMessage<?>> scoreboards = broadcaster.all.stream()
                    .filter(m -> m.type() == MessageType.SCOREBOARD
                            && ((ScoreboardPayload) m.payload()).questionIndex() == reveal.questionIndex())
                    .toList();
            assertThat(scoreboards).hasSize(1);
            assertThat(((ScoreboardPayload) scoreboards.getFirst().payload()).answered()).containsExactly(botId);
            delays.add(Duration.between(started.startedAt(), scoreboards.getFirst().serverTime()).toMillis());
        }
        assertThat(right).isPositive();
        assertThat(wrong + silent).as("sometimes wrong or silent").isPositive();
        assertThat(delays.size()).as("delays vary across questions").isGreaterThan(1);
    }

    @Test
    void botDecisionsVaryAndStayInsideTheConfiguredRange() {
        BotBrain bots = new BotBrain(new BotSettings(Duration.ofSeconds(2), Duration.ofSeconds(12), 0.65, 0.10), new Random(42));
        InternalQuestion question = MatchTestKit.questions(4).get(2); // answer index 2
        Set<Duration> delays = new HashSet<>();
        int silent = 0;
        int right = 0;
        int wrong = 0;
        Set<Integer> wrongPicks = new HashSet<>();
        for (int i = 0; i < 2_000; i++) {
            Optional<BotBrain.Move> move = bots.decide(question);
            if (move.isEmpty()) {
                silent++;
                continue;
            }
            delays.add(move.get().delay());
            assertThat(move.get().delay()).isBetween(Duration.ofSeconds(2), Duration.ofSeconds(12));
            if (move.get().optionIndex() == 2) {
                right++;
            } else {
                wrong++;
                wrongPicks.add(move.get().optionIndex());
            }
        }
        assertThat(delays.size()).isGreaterThan(500);
        assertThat(silent / 2000.0).isBetween(0.07, 0.13);
        assertThat(right / (double) (right + wrong)).isBetween(0.60, 0.70);
        assertThat(wrongPicks).containsExactlyInAnyOrder(0, 1, 3);
        // The same seed plays the same game.
        BotBrain again = new BotBrain(new BotSettings(Duration.ofSeconds(2), Duration.ofSeconds(12), 0.65, 0.10), new Random(42));
        BotBrain first = new BotBrain(new BotSettings(Duration.ofSeconds(2), Duration.ofSeconds(12), 0.65, 0.10), new Random(42));
        for (int i = 0; i < 50; i++) {
            assertThat(again.decide(question)).isEqualTo(first.decide(question));
        }
    }

    // -----------------------------------------------------------------------------------------
    // Story 1.9: grace, forfeit, leave, abort, resync

    static MatchSettings graced(Duration window, Duration grace) {
        return new MatchSettings(Duration.ofMillis(10), window, Duration.ofMillis(50), Duration.ofMillis(10), grace);
    }

    @Test
    void theGraceForfeitsAfterItRunsOutReleasesHerAndRejectsHerLaterAnswers() throws Exception {
        // A Battle Room: the match goes on for the others.
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(3, 0, 2));
        UUID h0 = setup.humans().get("h0");
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(5), Duration.ofMillis(150)), silentBots());
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        Instant droppedAt = Instant.now();
        actor.tell(new MatchEvent.Disconnect("h0"));
        ServerMessage<?> forfeited = broadcaster.next(MessageType.PARTICIPANT_FORFEITED, Duration.ofSeconds(2));
        assertThat(Duration.between(droppedAt, forfeited.serverTime())).isGreaterThanOrEqualTo(Duration.ofMillis(140));
        assertThat(forfeited.payload()).isEqualTo(new ParticipantForfeitedPayload(h0, 0));
        assertThat(released).containsExactly("h0");

        actor.tell(new MatchEvent.Answer(h0, 0, 0, Instant.now(), new MatchEvent.ReplyTo("h0", "s0")));
        await().atMost(Duration.ofSeconds(2)).until(() -> !channel.to("h0").isEmpty());
        assertThat(((ErrorPayload) channel.to("h0").getFirst().message().payload()).code().name())
                .isEqualTo("ANSWER_REJECTED");
        // The others play on, and the question closes early once both have answered.
        actor.tell(new MatchEvent.Answer(setup.humans().get("h1"), 0, 0, Instant.now(), new MatchEvent.ReplyTo("h1", "s1")));
        actor.tell(new MatchEvent.Answer(setup.humans().get("h2"), 0, 0, Instant.now(), new MatchEvent.ReplyTo("h2", "s2")));
        broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(1));
        assertThat(actor.isEnded()).isFalse();
    }

    @Test
    void aHumanVsHumanOneVsOneGraceForfeitEndsTheMatchAtOnceAsCompletedWithTheForfeiterLast() throws Exception {
        MatchSetup setup = MatchTestKit.setup(2, 0, 2);
        UUID h0 = setup.humans().get("h0");
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(5), Duration.ofMillis(150)), silentBots());
        actor.tell(new MatchEvent.Begin());
        QuestionStartedPayload started = (QuestionStartedPayload) broadcaster
                .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)).payload();
        // h0 leads on score, then drops; the grace runs out before the Q1 reveal.
        actor.tell(new MatchEvent.Answer(h0, 0, setup.questions().getFirst().answerIndex(),
                started.startedAt().plusMillis(100), new MatchEvent.ReplyTo("h0", "s0")));
        actor.tell(new MatchEvent.Disconnect("h0"));
        broadcaster.next(MessageType.PARTICIPANT_FORFEITED, Duration.ofSeconds(2));
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(actor.isCompleted()).isTrue();
        assertThat(actor.isAborted()).isFalse();
        assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED)).as("the open question is revealed").hasSize(1);
        assertThat(broadcaster.ofType(MessageType.QUESTION_STARTED)).as("no further question").hasSize(1);
        await().atMost(Duration.ofSeconds(1)).until(() -> published.size() == 1);
        assertThat(published.getFirst().participants()).extracting(CompletedParticipant::placement)
                .containsExactly(2, 1);
        assertThat(published.getFirst().participants()).extracting(CompletedParticipant::forfeited)
                .containsExactly(true, false);
    }

    @Test
    void aHumanVsHumanOneVsOneLeaveBeforeTheFirstRevealCompletesInsteadOfAborting() throws Exception {
        MatchSetup setup = MatchTestKit.setup(2, 0, 3);
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(5), Duration.ofSeconds(10)), silentBots(), sub -> true);
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        actor.tell(new MatchEvent.Leave("h0"));
        actor.tell(new MatchEvent.Leave("h0")); // idempotent
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(actor.isCompleted()).isTrue();
        assertThat(broadcaster.ofType(MessageType.MATCH_ABORTED)).isEmpty();
        assertThat(matchEnded()).hasSize(2);
        Thread.sleep(100);
        assertThat(published).hasSize(1);
        assertThat(published.getFirst().startedAt()).isNotNull();
        assertThat(published.getFirst().endedAt()).isAfterOrEqualTo(published.getFirst().startedAt());
    }

    @Test
    void aReconnectInsideTheGraceCancelsItAndAStaleTimerDoesNothing() throws Exception {
        MatchSetup setup = MatchTestKit.setup(2, 0, 1);
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(3), Duration.ofMillis(200)), silentBots());
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        actor.tell(new MatchEvent.Disconnect("h0"));
        Thread.sleep(80);
        actor.tell(new MatchEvent.Reconnected("h0"));
        // A grace timer of an older epoch firing late is a no-op.
        actor.tell(new MatchEvent.GraceExpired("h0", 1));
        Thread.sleep(400);
        assertThat(broadcaster.ofType(MessageType.PARTICIPANT_FORFEITED)).isEmpty();
        assertThat(released).isEmpty();
    }

    @Test
    void aGraceThatRunsOutWhileASessionIsOpenAgainDoesNotForfeit() throws Exception {
        MatchSetup setup = MatchTestKit.setup(2, 0, 1);
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(3), Duration.ofMillis(100)), silentBots(), sub -> true);
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        actor.tell(new MatchEvent.Disconnect("h0"));
        Thread.sleep(400);
        assertThat(broadcaster.ofType(MessageType.PARTICIPANT_FORFEITED)).isEmpty();
    }

    @Test
    void leavingBeforeTheFirstRevealAbortsTheMatch() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 10);
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(3), Duration.ofSeconds(10)), silentBots());
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        actor.tell(new MatchEvent.Leave("h0"));
        actor.tell(new MatchEvent.Leave("h0")); // idempotent
        ServerMessage<?> aborted = broadcaster.next(MessageType.MATCH_ABORTED, Duration.ofSeconds(2));
        assertThat(aborted.payload()).isEqualTo(new MatchAbortedPayload(AbortReason.ALL_LEFT));
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(actor.isAborted()).isTrue();
        assertThat(actor.isCompleted()).isFalse();
        assertThat(broadcaster.all).extracting(ServerMessage::type).containsExactly(MessageType.QUESTION_STARTED,
                MessageType.PARTICIPANT_FORFEITED, MessageType.MATCH_ABORTED);
        assertThat(broadcaster.all).extracting(ServerMessage::seq).containsExactly(1L, 2L, 3L);
    }

    @Test
    void whenTheOnlyHumanLeavesAfterTheFirstRevealTheMatchFinishesAtOnceAsCompleted() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 10);
        MatchActor actor = actor(setup, graced(Duration.ofMillis(300), Duration.ofSeconds(10)), silentBots());
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2));
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)); // Q2 open
        Instant leftAt = Instant.now();
        actor.tell(new MatchEvent.Leave("h0"));
        await().atMost(Duration.ofMillis(250)).until(() -> endedWith.get() == actor);
        assertThat(Duration.between(leftAt, Instant.now())).isLessThan(Duration.ofMillis(250));
        assertThat(actor.isCompleted()).isTrue();
        assertThat(actor.isAborted()).isFalse();
        assertThat(broadcaster.ofType(MessageType.QUESTION_STARTED)).as("no further questions").hasSize(2);
        assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED)).as("Q2 closed at once").hasSize(2);
        assertThat(broadcaster.ofType(MessageType.MATCH_ABORTED)).isEmpty();
        assertThat(broadcaster.all.getLast().type()).isEqualTo(MessageType.QUESTION_REVEALED);
    }

    @Test
    void inAFiveWayMatchAForfeitClosesTheQuestionOnceTheRestHaveAnswered() throws Exception {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(5, 0, 2));
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(5), Duration.ofSeconds(10)), silentBots());
        actor.tell(new MatchEvent.Begin());
        QuestionStartedPayload started = (QuestionStartedPayload) broadcaster
                .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)).payload();
        for (int i = 1; i < 5; i++) {
            actor.tell(new MatchEvent.Answer(setup.humans().get("h" + i), 0, 0, Instant.now(),
                    new MatchEvent.ReplyTo("h" + i, "s" + i)));
        }
        Thread.sleep(100);
        assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED)).isEmpty();
        actor.tell(new MatchEvent.Leave("h0"));
        ServerMessage<?> reveal = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(1));
        assertThat(reveal.serverTime()).isBefore(started.deadline());
        assertThat(actor.isEnded()).isFalse();
    }

    @Test
    void resyncSendsThatSessionASnapshotWithHerOwnResult() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 3);
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(5), Duration.ofSeconds(10)), silentBots());
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        int answer = setup.questions().getFirst().answerIndex();
        actor.tell(new MatchEvent.Answer(setup.humans().get("h0"), 0, answer, Instant.now(), new MatchEvent.ReplyTo("h0", "s0")));
        actor.tell(new MatchEvent.Disconnect("h0"));
        actor.tell(new MatchEvent.Resync("h0", "s2"));
        await().atMost(Duration.ofSeconds(2)).until(() -> channel.to("h0").size() == 2);
        Sent reply = channel.to("h0").get(1);
        assertThat(reply.sessionId()).isEqualTo("s2");
        assertThat(reply.message().type()).isEqualTo(MessageType.SNAPSHOT);
        assertThat(reply.message().refSeq()).isEqualTo(2);
        SnapshotPayload snapshot = (SnapshotPayload) reply.message().payload();
        assertThat(snapshot.phase()).isEqualTo(SnapshotPhase.QUESTION_OPEN);
        assertThat(snapshot.myAnswer().pickedIndex()).isEqualTo(answer);
        assertThat(snapshot.myAnswer().correct()).isTrue();
        assertThat(actor.state().participants().getFirst().connection().name()).isEqualTo("CONNECTED");
    }

    @Test
    void aHandlerErrorBroadcastsTheErrorAbortAndEndsAsFailed() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 3);
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(5), Duration.ofSeconds(10)), silentBots());
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        // A NextQuestion out of order makes the state throw.
        actor.tell(new MatchEvent.NextQuestion(2, Instant.now()));
        ServerMessage<?> aborted = broadcaster.next(MessageType.MATCH_ABORTED, Duration.ofSeconds(2));
        assertThat(aborted.payload()).isEqualTo(new MatchAbortedPayload(AbortReason.ERROR));
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(actor.isFailed()).isTrue();
    }

    // ---------------------------------------------------------------------------------------------
    // Story 1.10: MATCH_ENDED and minnal.match.completed

    /** The private MATCH_ENDED messages sent so far. */
    List<Sent> matchEnded() {
        return channel.sent.stream().filter(s -> s.message().type() == MessageType.MATCH_ENDED).toList();
    }

    /**
     * Two humans (h0 a registered USER, h1 a guest) and a bot over 3 questions: h0 answers every
     * question right, h1 answers Q0 right and leaves at Q1, the bot is silent. Both still have a
     * session at the end, so both get MATCH_ENDED (h1 forfeited), and one event is published.
     */
    @Test
    void aCompletedMatchSendsMatchEndedToEveryLiveHumanThenPublishesOneEvent() throws Exception {
        MatchSetup base = MatchTestKit.setup(2, 1, 3);
        List<Participant> participants = new ArrayList<>(base.participants());
        Participant user = participants.getFirst();
        participants.set(0, new Participant(user.participantId(), "Anju", ParticipantKind.USER));
        MatchSetup setup = new MatchSetup(base.matchId(), MatchMode.QUICK, participants, base.humans(), base.questions(),
                java.util.Map.of("h0", 2_000L, "h1", 5_000L), base.ratings(), base.createdAt(), QuestionSource.BANK);
        MatchActor actor = actor(setup, graced(Duration.ofMillis(400), Duration.ofSeconds(10)), silentBots(),
                sub -> true);
        UUID h0 = setup.humans().get("h0");
        UUID h1 = setup.humans().get("h1");
        actor.tell(new MatchEvent.Begin());
        Instant q1StartedAt = null;
        for (int q = 0; q < 3; q++) {
            QuestionStartedPayload started = (QuestionStartedPayload) broadcaster
                    .next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)).payload();
            if (q == 0) {
                q1StartedAt = started.startedAt();
            }
            int right = setup.questions().get(q).answerIndex();
            actor.tell(new MatchEvent.Answer(h0, q, right, started.startedAt().plusMillis(100),
                    new MatchEvent.ReplyTo("h0", "s0")));
            if (q == 0) {
                actor.tell(new MatchEvent.Answer(h1, q, right, started.startedAt().plusMillis(200),
                        new MatchEvent.ReplyTo("h1", "s1")));
            } else if (q == 1) {
                actor.tell(new MatchEvent.Leave("h1"));
            }
            broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2));
        }
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);

        assertThat(matchEnded()).extracting(Sent::sub).containsExactlyInAnyOrder("h0", "h1");
        ServerMessage<?> message = matchEnded().getFirst().message();
        assertThat(message.seq()).as("private: no seq").isNull();
        assertThat(message.matchId()).isEqualTo(setup.matchId());
        MatchEndedPayload payload = (MatchEndedPayload) message.payload();
        assertThat(payload.mode()).isEqualTo(MatchMode.QUICK);
        assertThat(payload.questionSource()).isEqualTo(QuestionSource.BANK);
        assertThat(payload.questions()).hasSize(3);
        assertThat(payload.questions().get(1).answerIndex()).isEqualTo(setup.questions().get(1).answerIndex());
        assertThat(payload.participants()).extracting(ResultParticipant::participantId)
                .containsExactly(h0, h1, setup.participants().get(2).participantId());
        ResultParticipant anju = payload.participants().get(0);
        ResultParticipant left = payload.participants().get(1);
        ResultParticipant bot = payload.participants().get(2);
        assertThat(anju.correctCount()).isEqualTo(3);
        assertThat(anju.placement()).isEqualTo(1);
        assertThat(left.forfeited()).isTrue();
        assertThat(left.correctCount()).isEqualTo(1);
        assertThat(left.score()).isPositive();
        assertThat(left.placement()).as("a 1v1 forfeiter always places last").isEqualTo(3);
        assertThat(bot.score()).isZero();
        assertThat(bot.placement()).isEqualTo(2);
        assertThat(bot.kind()).isEqualTo(ParticipantKind.BOT);
        List<BreakdownAnswer> anjuAnswers = payload.breakdown().get(0).answers();
        assertThat(anjuAnswers).hasSize(3).allSatisfy(a -> {
            assertThat(a.correct()).isTrue();
            assertThat(a.responseMs()).isEqualTo(100L);
        });
        assertThat(anjuAnswers.stream().mapToInt(BreakdownAnswer::points).sum()).isEqualTo(anju.score());
        assertThat(payload.breakdown().get(1).answers().get(1)).isEqualTo(BreakdownAnswer.missed());
        assertThat(payload.breakdown().get(2).answers()).containsOnly(BreakdownAnswer.missed());

        await().atMost(Duration.ofSeconds(1)).until(() -> published.size() == 1);
        MatchCompletedEvent event = published.getFirst();
        assertThat(event.matchId()).isEqualTo(setup.matchId());
        assertThat(event.rated()).isTrue();
        assertThat(event.questionSource()).isEqualTo(QuestionSource.BANK);
        assertThat(event.startedAt()).isEqualTo(q1StartedAt);
        assertThat(event.endedAt()).isAfterOrEqualTo(event.startedAt());
        assertThat(event.queueWaitMs()).isEqualTo(5_000L);
        assertThat(event.roomId()).isNull();
        assertThat(event.participants()).extracting(CompletedParticipant::userId).containsExactly("h0", null, null);
        assertThat(event.participants()).extracting(CompletedParticipant::placement).containsExactly(1, 3, 2);
        assertThat(event.participants()).extracting(CompletedParticipant::forfeited).containsExactly(false, true, false);
        Thread.sleep(100);
        assertThat(published).hasSize(1);
    }

    @Test
    void aHumanWithoutALiveSessionGetsNoMatchEndedButTheEventIsStillPublished() throws Exception {
        MatchSetup setup = MatchTestKit.setup(2, 0, 1);
        MatchActor actor = actor(setup, graced(Duration.ofMillis(150), Duration.ofSeconds(10)), silentBots(),
                sub -> sub.equals("h0"));
        actor.tell(new MatchEvent.Begin());
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(matchEnded()).extracting(Sent::sub).containsExactly("h0");
        MatchEndedPayload payload = (MatchEndedPayload) matchEnded().getFirst().message().payload();
        assertThat(payload.participants()).extracting(ResultParticipant::placement).as("0 to 0 is a full tie")
                .containsExactly(1, 1);
        assertThat(published).hasSize(1);
        assertThat(published.getFirst().queueWaitMs()).as("no wait known").isNull();
    }

    @Test
    void whenEveryHumanLeavesAtQ3TheResultsListOnlyTheAskedQuestions() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 10);
        MatchActor actor = actor(setup, graced(Duration.ofMillis(200), Duration.ofSeconds(10)), silentBots(),
                sub -> true);
        actor.tell(new MatchEvent.Begin());
        for (int q = 0; q < 2; q++) {
            broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2));
        }
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2)); // Q3 open
        actor.tell(new MatchEvent.Leave("h0"));
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(matchEnded()).hasSize(1);
        MatchEndedPayload payload = (MatchEndedPayload) matchEnded().getFirst().message().payload();
        assertThat(payload.questions()).hasSize(3);
        assertThat(payload.breakdown()).allSatisfy(b -> assertThat(b.answers()).hasSize(3));
        assertThat(payload.participants().getFirst().forfeited()).isTrue();
        assertThat(published).hasSize(1);
    }

    @Test
    void anAbortedMatchSendsNoMatchEndedAndPublishesNothing() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 10);
        MatchActor actor = actor(setup, graced(Duration.ofSeconds(3), Duration.ofSeconds(10)), silentBots(),
                sub -> true);
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        actor.tell(new MatchEvent.Leave("h0"));
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(matchEnded()).isEmpty();
        assertThat(published).isEmpty();
    }

    @Test
    void aFailedMatchSendsNoMatchEndedAndPublishesNothingEvenAfterQ1() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 1, 3);
        MatchActor actor = actor(setup, graced(Duration.ofMillis(150), Duration.ofSeconds(10)), silentBots(),
                sub -> true);
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2));
        actor.tell(new MatchEvent.NextQuestion(0, Instant.now())); // out of order: the state throws
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(actor.isFailed()).isTrue();
        assertThat(matchEnded()).isEmpty();
        assertThat(published).isEmpty();
    }

    @Test
    void aPublisherThatThrowsDoesNotStopTheEnd() throws Exception {
        MatchSetup setup = MatchTestKit.setup(1, 0, 1);
        MatchSettings settings = graced(Duration.ofMillis(100), Duration.ofSeconds(10));
        MatchState state = MatchState.of(setup, settings.window(), sub -> true);
        MatchActor actor = new MatchActor(setup, state, settings, Clock.systemUTC(), timers, channel, broadcaster,
                silentBots(), new MatchMetrics(meters), endedWith::set, sub -> true, released::add, event -> {
                    throw new IllegalStateException("boom");
                });
        actors.add(actor);
        actor.tell(new MatchEvent.Begin());
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() == actor);
        assertThat(matchEnded()).hasSize(1);
    }
}
