package in.minnal.game.match.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.AnswerAcceptedPayload;
import in.minnal.contracts.realtime.ErrorPayload;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.ParticipantResult;
import in.minnal.contracts.realtime.QuestionRevealedPayload;
import in.minnal.contracts.realtime.QuestionStartedPayload;
import in.minnal.contracts.realtime.ScoreboardPayload;
import in.minnal.contracts.realtime.ServerMessage;
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
import java.util.concurrent.CountDownLatch;
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

    @AfterEach
    void stop() {
        actors.forEach(MatchActor::close);
        timers.destroy();
    }

    BotBrain silentBots() {
        return new BotBrain(new BotSettings(Duration.ZERO, Duration.ZERO, 1, 1), new Random(1));
    }

    MatchActor actor(MatchSetup setup, MatchSettings settings, BotBrain bots) {
        MatchState state = MatchState.of(setup, settings.window(), sub -> true);
        MatchActor actor = new MatchActor(setup, state, settings, Clock.systemUTC(), timers, channel, broadcaster, bots,
                new MatchMetrics(meters), endedWith::set);
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
}
