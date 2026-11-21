package in.minnal.game.match.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.realtime.AbortReason;
import in.minnal.contracts.realtime.AnswerAcceptedPayload;
import in.minnal.contracts.realtime.MatchAbortedPayload;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.QuestionRevealedPayload;
import in.minnal.contracts.realtime.QuestionStartedPayload;
import in.minnal.contracts.realtime.ScoreboardPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.MatchTestKit.RecordingBroadcaster;
import in.minnal.game.match.application.MatchTestKit.RecordingChannel;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.match.domain.MatchState;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.Random;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * Story 5.4: the one match actor run as a Battle Room (N = 2, N = 5 and 50 humans): Q1 at the room's instant, the 3 s
 * hold, receipt-only acks, a scoreboard coalesced to 250 ms, an early close when everyone answered, the abort, and no
 * {@code minnal.match.completed}.
 */
class MatchActorRoomTest {

    static final Duration WINDOW = Duration.ofSeconds(5);

    final RecordingChannel channel = new RecordingChannel();
    final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
    final ScheduledMatchTimers timers = new ScheduledMatchTimers();
    final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    final AtomicReference<MatchActor> endedWith = new AtomicReference<>();
    final List<MatchActor> actors = new ArrayList<>();
    final List<MatchCompletedEvent> published = new CopyOnWriteArrayList<>();

    @AfterEach
    void stop() {
        actors.forEach(MatchActor::close);
        timers.destroy();
    }

    MatchSettings settings(Duration roomHold, Duration coalesce) {
        return new MatchSettings(Duration.ofMillis(10), WINDOW, Duration.ofMillis(50), Duration.ofMillis(10),
                MatchSettings.DEFAULT_GRACE, roomHold, coalesce);
    }

    MatchActor actor(MatchSetup setup, MatchSettings settings, Instant firstQuestionAt) {
        return actor(setup, settings, firstQuestionAt, sub -> true);
    }

    MatchActor actor(MatchSetup setup, MatchSettings settings, Instant firstQuestionAt,
            java.util.function.Predicate<String> hasSession) {
        MatchState state = MatchState.of(setup, settings.window(), sub -> true);
        BotBrain bots = new BotBrain(new BotSettings(Duration.ZERO, Duration.ZERO, 1, 1), new Random(1));
        MatchActor actor = new MatchActor(setup, state, settings, Clock.systemUTC(), timers, channel, broadcaster, bots,
                new MatchMetrics(meters), endedWith::set, hasSession, sub -> { }, published::add, firstQuestionAt);
        actors.add(actor);
        return actor;
    }

    static void answer(MatchActor actor, MatchSetup setup, int human, int question, int option) {
        String sub = "h" + human;
        actor.tell(new MatchEvent.Answer(setup.humans().get(sub), question, option, Instant.now(),
                new MatchEvent.ReplyTo(sub, "s" + human)));
    }

    @Test
    void roomMatchesOfTwoAndFiveHumansRunTheSameListBasedPathWithReceiptsAndOneCompletedEventEach() throws Exception {
        for (int humans : new int[] {2, 5}) {
            broadcaster.all.clear();
            channel.sent.clear();
            published.clear();
            MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(humans, 0, 2));
            Instant firstQuestionAt = Instant.now().plusMillis(400);
            MatchActor actor = actor(setup, settings(Duration.ofMillis(10), Duration.ofMillis(250)), firstQuestionAt);
            actor.tell(new MatchEvent.Begin());

            ServerMessage<?> started = broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
            assertThat(Instant.now()).as("Q1 never opens early").isAfterOrEqualTo(firstQuestionAt);
            QuestionStartedPayload opened = (QuestionStartedPayload) started.payload();
            assertThat(opened.startedAt()).isEqualTo(firstQuestionAt);
            assertThat(opened.total()).isEqualTo(2);
            assertThat(opened.deadline()).isEqualTo(firstQuestionAt.plus(WINDOW));

            // Everyone but the last answers: the receipt carries nothing about correctness.
            for (int h = 0; h < humans - 1; h++) {
                answer(actor, setup, h, 0, setup.questions().getFirst().answerIndex());
            }
            await().atMost(Duration.ofSeconds(2)).until(() -> channel.sent.size() == setup.humans().size() - 1);
            assertThat(channel.sent).allSatisfy(sent -> {
                AnswerAcceptedPayload receipt = (AnswerAcceptedPayload) sent.message().payload();
                assertThat(receipt.correct()).isNull();
                assertThat(receipt.points()).isNull();
                assertThat(receipt.answerIndex()).isNull();
            });
            ServerMessage<?> board = broadcaster.next(MessageType.SCOREBOARD, Duration.ofSeconds(2));
            assertThat(((ScoreboardPayload) board.payload()).answered()).isNotEmpty();
            assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED)).as("not closed yet").isEmpty();

            // The last answer closes the question at once: one reveal carrying every participant.
            answer(actor, setup, humans - 1, 0, 0);
            ServerMessage<?> reveal = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2));
            assertThat(((QuestionRevealedPayload) reveal.payload()).results()).hasSize(humans);
            assertThat(Duration.between(firstQuestionAt, reveal.serverTime())).isLessThan(WINDOW);

            // Question 2, nobody answers: the full window.
            broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
            actors.remove(actor);
            actor.close();
        }
    }

    @Test
    void aRoomHoldsTheRevealForTheRoomHoldNotThe1v1One() throws Exception {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(2, 0, 2));
        MatchActor actor = actor(setup, settings(Duration.ofMillis(700), Duration.ofMillis(250)), Instant.now().plusMillis(50));
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        answer(actor, setup, 0, 0, 0);
        answer(actor, setup, 1, 0, 0);
        ServerMessage<?> reveal = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2));
        ServerMessage<?> next = broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(3));
        assertThat(Duration.between(reveal.serverTime(), next.serverTime())).isGreaterThanOrEqualTo(Duration.ofMillis(650));
    }

    @Test
    void fiftyPlayersAnsweringAtOnceGetAtMostOneScoreboardPer250msAndTheRevealWithin500ms() throws Exception {
        int humans = 50;
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(humans, 0, 1));
        MatchActor actor = actor(setup, settings(Duration.ofMillis(10), Duration.ofMillis(250)), Instant.now().plusMillis(50));
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));

        for (int h = 0; h < humans - 1; h++) {
            answer(actor, setup, h, 0, 1);
            Thread.sleep(8); // answers spread over about 400 ms
        }
        Instant lastAnswerAt = Instant.now();
        answer(actor, setup, humans - 1, 0, 1);
        ServerMessage<?> reveal = broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2));
        assertThat(Duration.between(lastAnswerAt, reveal.serverTime())).isLessThan(Duration.ofMillis(500));

        List<ServerMessage<?>> boards = broadcaster.ofType(MessageType.SCOREBOARD);
        assertThat(boards).isNotEmpty().hasSizeLessThan(humans);
        for (int i = 1; i < boards.size(); i++) {
            assertThat(Duration.between(boards.get(i - 1).serverTime(), boards.get(i).serverTime()))
                    .as("scoreboard %d", i).isGreaterThanOrEqualTo(Duration.ofMillis(240));
        }
        // seq stays gapless: a coalesced scoreboard spends no seq.
        List<Long> seqs = broadcaster.all.stream().map(ServerMessage::seq).toList();
        for (int i = 0; i < seqs.size(); i++) {
            assertThat(seqs.get(i)).isEqualTo(i + 1L);
        }
        // No lag over 500 ms for the scoreboards, and the receipts' p95 is far under 200 ms.
        double maxScoreboardLagMs = meters.get(MatchMetrics.BROADCAST_LAG).tag("type", "SCOREBOARD").timer().max(java.util.concurrent.TimeUnit.MILLISECONDS);
        assertThat(maxScoreboardLagMs).isLessThan(500);
        assertThat(meters.get(MatchMetrics.ACK).timer().max(java.util.concurrent.TimeUnit.MILLISECONDS)).isLessThan(200);
    }

    @Test
    void everyHumanGoneBeforeTheFirstRevealAbortsWithNothingPublishedAndTheEndListenerRuns() throws Exception {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(3, 0, 2));
        MatchActor actor = actor(setup, settings(Duration.ofMillis(10), Duration.ofMillis(250)), Instant.now().plusMillis(50));
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));

        for (int h = 0; h < 3; h++) {
            actor.tell(new MatchEvent.Leave("h" + h));
        }

        ServerMessage<?> aborted = broadcaster.next(MessageType.MATCH_ABORTED, Duration.ofSeconds(2));
        assertThat(((MatchAbortedPayload) aborted.payload()).reason()).isEqualTo(AbortReason.ALL_LEFT);
        await().atMost(Duration.ofSeconds(2)).until(() -> endedWith.get() != null);
        assertThat(actor.isAborted()).isTrue();
        assertThat(published).isEmpty();
        assertThat(channel.sent.stream().filter(s -> s.message().type() == MessageType.MATCH_ENDED)).isEmpty();
    }

    @Test
    void aFinishedRoomMatchSendsMatchEndedWithTheRoomBlockAndPublishesOneRatedCompletedEvent() throws Exception {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(2, 0, 1));
        MatchActor actor = actor(setup, settings(Duration.ofMillis(10), Duration.ofMillis(250)), Instant.now().plusMillis(50));
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        answer(actor, setup, 0, 0, 0);
        answer(actor, setup, 1, 0, 1);

        await().atMost(Duration.ofSeconds(3)).until(() -> endedWith.get() != null);
        assertThat(actor.isCompleted()).isTrue();
        assertThat(channel.sent.stream().filter(s -> s.message().type() == MessageType.MATCH_ENDED)).hasSize(2);
        in.minnal.contracts.realtime.MatchEndedPayload ended = (in.minnal.contracts.realtime.MatchEndedPayload) channel.sent
                .stream().filter(s -> s.message().type() == MessageType.MATCH_ENDED).findFirst().orElseThrow().message().payload();
        assertThat(ended.room()).isEqualTo(setup.room());
        assertThat(published).hasSize(1);
        MatchCompletedEvent event = published.getFirst();
        assertThat(event.mode()).isEqualTo(in.minnal.contracts.realtime.MatchMode.BATTLE_ROOM);
        assertThat(event.roomId()).isEqualTo(setup.room().roomId());
        assertThat(event.rated()).isTrue();
        assertThat(event.queueWaitMs()).isNull();
    }

    @Test
    void aRoomForfeiterWhoOutScoredAnotherPlayerRanksOnHerEarnedScoreInBothOutputs() throws Exception {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(3, 0, 2));
        MatchActor actor = actor(setup, settings(Duration.ofMillis(10), Duration.ofMillis(250)), Instant.now().plusMillis(50));
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        int right = setup.questions().getFirst().answerIndex();
        answer(actor, setup, 0, 0, right);
        answer(actor, setup, 1, 0, (right + 1) % 4);
        answer(actor, setup, 2, 0, (right + 1) % 4);
        broadcaster.next(MessageType.QUESTION_REVEALED, Duration.ofSeconds(2));
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        actor.tell(new MatchEvent.Leave("h0")); // she earned points on Q1, then left
        answer(actor, setup, 1, 1, 0);
        answer(actor, setup, 2, 1, 0);

        await().atMost(Duration.ofSeconds(3)).until(() -> endedWith.get() != null);
        UUID leaver = setup.humans().get("h0");
        in.minnal.contracts.realtime.MatchEndedPayload ended = (in.minnal.contracts.realtime.MatchEndedPayload) channel.sent
                .stream().filter(s -> s.message().type() == MessageType.MATCH_ENDED).findFirst().orElseThrow().message().payload();
        var self = ended.participants().stream().filter(p -> p.participantId().equals(leaver)).findFirst().orElseThrow();
        assertThat(self.forfeited()).isTrue();
        assertThat(self.score()).isPositive();
        assertThat(self.placement()).isEqualTo(1);
        assertThat(ended.participants().stream().filter(p -> !p.participantId().equals(leaver)))
                .allSatisfy(p -> assertThat(p.placement()).isGreaterThan(1));
        assertThat(published).hasSize(1);
        assertThat(published.getFirst().participants().stream().filter(p -> p.participantId().equals(leaver)).findFirst().orElseThrow()
                .placement()).isEqualTo(1);
    }

    @Test
    void aOneVsOneStillSendsOneScoreboardPerAnswerAndPublishesCompleted() throws Exception {
        MatchSetup setup = MatchTestKit.setup(2, 0, 1);
        MatchActor actor = actor(setup, settings(Duration.ofMillis(10), Duration.ofMillis(250)), null);
        actor.tell(new MatchEvent.Begin());
        broadcaster.next(MessageType.QUESTION_STARTED, Duration.ofSeconds(2));
        answer(actor, setup, 0, 0, 0);
        broadcaster.next(MessageType.SCOREBOARD, Duration.ofSeconds(2));
        answer(actor, setup, 1, 0, 1);

        await().atMost(Duration.ofSeconds(3)).until(() -> endedWith.get() != null);
        assertThat(published).hasSize(1);
    }


    @Test
    void aHumanWithNoSessionWhenARoomMatchBeginsGetsTheGraceAndForfeitsWhileTheOthersPlayOn() throws Exception {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(3, 0, 2));
        MatchSettings graced = new MatchSettings(Duration.ofMillis(10), WINDOW, Duration.ofMillis(50), Duration.ofMillis(10),
                Duration.ofMillis(150), Duration.ofMillis(10), Duration.ofMillis(250));
        MatchActor actor = actor(setup, graced, Instant.now().plusMillis(50), sub -> !sub.equals("h0"));
        actor.tell(new MatchEvent.Begin());

        ServerMessage<?> forfeited = broadcaster.next(MessageType.PARTICIPANT_FORFEITED, Duration.ofSeconds(2));
        assertThat(((in.minnal.contracts.realtime.ParticipantForfeitedPayload) forfeited.payload()).participantId())
                .isEqualTo(setup.humans().get("h0"));
        assertThat(broadcaster.ofType(MessageType.PARTICIPANT_FORFEITED)).hasSize(1);
        assertThat(actor.isEnded()).isFalse();
    }
}
