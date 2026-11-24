package in.minnal.game.match.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.QuestionStartedPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.MatchTestKit.RecordingBroadcaster;
import in.minnal.game.match.application.MatchTestKit.RecordingChannel;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.match.domain.MatchState;
import in.minnal.game.support.MutableClock;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Future;
import java.util.function.Predicate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * Epic 5 retro action: {@link MatchActorRoomTest} runs the room match on the wall clock and real timers, so its timing
 * claims (Q1 never early, a 250 ms coalesced scoreboard, a 3 s reveal hold) are only as steady as the machine. Here the
 * same actor runs on a {@link MutableClock} and {@link ManualTimers}: time moves only when the test moves it, so each claim
 * is an exact equality, and a loaded CI box cannot fail it. Nothing here sleeps; the actor still runs on its own thread, so
 * the test waits for what it expects to see (a broadcast, a timer armed) and never for time to pass.
 */
class MatchActorRoomManualClockTest {

    static final Duration WINDOW = Duration.ofSeconds(5);
    static final Duration CLOSE_GRACE = Duration.ofMillis(50);
    static final Duration ROOM_HOLD = Duration.ofSeconds(3);
    static final Duration COALESCE = Duration.ofMillis(250);
    static final Instant T0 = Instant.parse("2026-11-12T10:00:00Z");

    /** Timers that run only when the clock is moved past them (in due order), never on their own. */
    static final class ManualTimers implements MatchTimers {

        record Timer(Duration delay, Instant dueAt, Runnable task, CompletableFuture<Void> future) {
        }

        private final MutableClock clock;
        private final List<Timer> timers = new CopyOnWriteArrayList<>();

        ManualTimers(MutableClock clock) {
            this.clock = clock;
        }

        @Override
        public Future<?> schedule(Duration delay, Runnable task) {
            Timer timer = new Timer(delay, clock.instant().plus(delay), task, new CompletableFuture<>());
            timers.add(timer);
            return timer.future();
        }

        List<Timer> pending() {
            return timers.stream().filter(t -> !t.future().isDone()).toList();
        }

        boolean hasPending(Duration delay) {
            return pending().stream().anyMatch(t -> t.delay().equals(delay));
        }

        /** Moves the clock by {@code by} and runs, in due order, every pending timer now due. */
        void advance(Duration by) {
            clock.advance(by);
            List<Timer> due = new ArrayList<>(pending().stream().filter(t -> !t.dueAt().isAfter(clock.instant())).toList());
            due.sort(java.util.Comparator.comparing(Timer::dueAt));
            for (Timer timer : due) {
                if (timer.future().complete(null)) {
                    timer.task().run();
                }
            }
        }

        void cancelAll() {
            timers.forEach(t -> t.future().cancel(false));
        }
    }

    final MutableClock clock = new MutableClock(T0);
    final ManualTimers timers = new ManualTimers(clock);
    final RecordingChannel channel = new RecordingChannel();
    final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
    final List<MatchActor> actors = new ArrayList<>();

    @AfterEach
    void stop() {
        actors.forEach(MatchActor::close);
        timers.cancelAll();
    }

    MatchActor roomActor(MatchSetup setup, Instant firstQuestionAt) {
        MatchSettings settings = new MatchSettings(Duration.ofMillis(10), WINDOW, CLOSE_GRACE, Duration.ofMillis(10),
                MatchSettings.DEFAULT_GRACE, ROOM_HOLD, COALESCE);
        MatchState state = MatchState.of(setup, settings.window(), sub -> true);
        BotBrain bots = new BotBrain(new BotSettings(Duration.ZERO, Duration.ZERO, 1, 1), new Random(1));
        MatchActor actor = new MatchActor(setup, state, settings, clock, timers, channel, broadcaster, bots,
                new MatchMetrics(new SimpleMeterRegistry()), ended -> { }, sub -> true, sub -> { }, event -> { }, firstQuestionAt);
        actors.add(actor);
        return actor;
    }

    void answer(MatchActor actor, MatchSetup setup, int human, int question, int option) {
        String sub = "h" + human;
        actor.tell(new MatchEvent.Answer(setup.humans().get(sub), question, option, clock.instant(),
                new MatchEvent.ReplyTo(sub, "s" + human)));
    }

    long count(MessageType type) {
        return broadcaster.ofType(type).size();
    }

    void awaitCount(MessageType type, long expected) {
        await().atMost(Duration.ofSeconds(5)).until(() -> count(type) == expected);
    }

    @Test
    void theFirstQuestionOpensAtTheRoomsInstantEvenWhenItsTimerFiresLate() {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(2, 0, 2));
        Instant firstQuestionAt = T0.plusSeconds(3);
        roomActor(setup, firstQuestionAt).tell(new MatchEvent.Begin());

        await().atMost(Duration.ofSeconds(5)).until(() -> timers.hasPending(Duration.ofSeconds(3)));
        timers.advance(Duration.ofMillis(2_999));
        assertThat(count(MessageType.QUESTION_STARTED)).as("never early").isZero();

        timers.advance(Duration.ofMillis(41)); // the timer fires 40 ms late: the clients were promised 3 s
        awaitCount(MessageType.QUESTION_STARTED, 1);
        QuestionStartedPayload opened = (QuestionStartedPayload) broadcaster.ofType(MessageType.QUESTION_STARTED).getFirst().payload();
        assertThat(opened.startedAt()).isEqualTo(firstQuestionAt);
        assertThat(opened.deadline()).isEqualTo(firstQuestionAt.plus(WINDOW));
    }

    @Test
    void anUnansweredQuestionClosesAtTheDeadlinePlusTheCloseGraceAndNotASecondSooner() {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(2, 0, 2));
        roomActor(setup, T0.plusSeconds(1)).tell(new MatchEvent.Begin());
        await().atMost(Duration.ofSeconds(5)).until(() -> timers.hasPending(Duration.ofSeconds(1)));
        timers.advance(Duration.ofSeconds(1));
        awaitCount(MessageType.QUESTION_STARTED, 1);
        Duration untilClose = WINDOW.plus(CLOSE_GRACE);
        await().atMost(Duration.ofSeconds(5)).until(() -> timers.hasPending(untilClose));

        timers.advance(untilClose.minusMillis(1));
        assertThat(count(MessageType.QUESTION_REVEALED)).isZero();
        timers.advance(Duration.ofMillis(1));
        awaitCount(MessageType.QUESTION_REVEALED, 1);
        assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED).getFirst().serverTime())
                .isEqualTo(T0.plusSeconds(1).plus(untilClose));
    }

    @Test
    void aRoomHoldsTheRevealForExactlyTheRoomHoldBeforeTheNextQuestion() {
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(2, 0, 2));
        MatchActor actor = roomActor(setup, T0.plusSeconds(1));
        actor.tell(new MatchEvent.Begin());
        await().atMost(Duration.ofSeconds(5)).until(() -> timers.hasPending(Duration.ofSeconds(1)));
        timers.advance(Duration.ofSeconds(1));
        awaitCount(MessageType.QUESTION_STARTED, 1);

        answer(actor, setup, 0, 0, 0);
        answer(actor, setup, 1, 0, 0); // the last answer closes the question at once, at the same instant
        awaitCount(MessageType.QUESTION_REVEALED, 1);
        ServerMessage<?> reveal = broadcaster.ofType(MessageType.QUESTION_REVEALED).getFirst();
        assertThat(reveal.serverTime()).isEqualTo(T0.plusSeconds(1));
        await().atMost(Duration.ofSeconds(5)).until(() -> timers.hasPending(ROOM_HOLD));

        timers.advance(ROOM_HOLD.minusMillis(1));
        assertThat(count(MessageType.QUESTION_STARTED)).as("still holding").isEqualTo(1);
        timers.advance(Duration.ofMillis(1));
        awaitCount(MessageType.QUESTION_STARTED, 2);
        assertThat(Duration.between(reveal.serverTime(), broadcaster.ofType(MessageType.QUESTION_STARTED).get(1).serverTime()))
                .isEqualTo(ROOM_HOLD);
    }

    @Test
    void fortyNineAnswersAtOneInstantGiveOneScoreboardAtOnceAndOneMoreAfterExactlyTheCoalescingWindow() {
        int humans = 50;
        MatchSetup setup = MatchTestKit.room(MatchTestKit.setup(humans, 0, 2));
        MatchActor actor = roomActor(setup, T0.plusSeconds(1));
        actor.tell(new MatchEvent.Begin());
        await().atMost(Duration.ofSeconds(5)).until(() -> timers.hasPending(Duration.ofSeconds(1)));
        timers.advance(Duration.ofSeconds(1));
        awaitCount(MessageType.QUESTION_STARTED, 1);

        for (int h = 0; h < humans - 1; h++) {
            answer(actor, setup, h, 0, 1);
        }
        await().atMost(Duration.ofSeconds(5)).until(() -> channel.sent.size() == humans - 1 && timers.hasPending(COALESCE));
        assertThat(count(MessageType.SCOREBOARD)).as("the first answer's board went at once, the rest wait").isEqualTo(1);
        assertThat(timers.pending().stream().filter(t -> t.delay().equals(COALESCE))).as("one flush armed, not 48").hasSize(1);

        timers.advance(COALESCE.minusMillis(1));
        assertThat(count(MessageType.SCOREBOARD)).isEqualTo(1);
        timers.advance(Duration.ofMillis(1));
        awaitCount(MessageType.SCOREBOARD, 2);
        List<ServerMessage<?>> boards = broadcaster.ofType(MessageType.SCOREBOARD);
        assertThat(Duration.between(boards.get(0).serverTime(), boards.get(1).serverTime())).isEqualTo(COALESCE);

        // The last answer closes the question: one reveal with everyone, and no board is left waiting.
        answer(actor, setup, humans - 1, 0, 1);
        awaitCount(MessageType.QUESTION_REVEALED, 1);
        assertThat(count(MessageType.SCOREBOARD)).isEqualTo(2);
        // seq stays gapless: a coalesced scoreboard spends no seq.
        List<Long> seqs = broadcaster.all.stream().map(ServerMessage::seq).toList();
        for (int i = 0; i < seqs.size(); i++) {
            assertThat(seqs.get(i)).isEqualTo(i + 1L);
        }
    }
}
