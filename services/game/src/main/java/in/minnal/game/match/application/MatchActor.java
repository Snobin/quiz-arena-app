package in.minnal.game.match.application;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.QuestionRevealedPayload;
import in.minnal.contracts.realtime.QuestionStartedPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.domain.MatchParticipant;
import in.minnal.game.match.domain.MatchPhase;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.match.domain.MatchState;
import in.minnal.game.match.domain.MatchState.AnswerOutcome;
import in.minnal.game.platform.actor.Actor;
import in.minnal.game.platform.session.MatchBroadcaster;
import in.minnal.game.platform.session.PlayerChannel;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * One live match (AD-4): a single-threaded {@link Actor} around a {@link MatchState}. Answers, timer
 * expiries, bot answers and disconnects are {@link MatchEvent}s handled one at a time on the
 * actor's thread; only that thread touches the state. Timers on the shared {@link MatchTimers} only
 * {@code tell} events. Effects are WebSocket sends only (private via {@link PlayerChannel},
 * broadcasts via {@link MatchBroadcaster}): no DB, Valkey or HTTP between Q1 and the last reveal.
 *
 * <p>Timeline: {@code Begin} → lead-in → {@code QUESTION_STARTED} → window → close grace →
 * {@code QUESTION_REVEALED} → reveal hold → the next question … → after the last reveal the match
 * is {@code ENDED} and {@code onEnded} runs (on the actor thread), then the actor stops.
 *
 * <p>Early close (AD-6, Story 1.11): as soon as every participant still in the match has an
 * accepted answer, the question closes at once (its deadline timer is cancelled) and follows the
 * same reveal → hold → next path. Points are already fixed by each answer's receive time.
 */
public final class MatchActor implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(MatchActor.class);

    private final MatchSetup setup;
    private final MatchState state;
    private final MatchSettings settings;
    private final Clock clock;
    private final MatchTimers timers;
    private final PlayerChannel channel;
    private final MatchBroadcaster broadcaster;
    private final BotBrain bots;
    private final MatchMetrics metrics;
    private final Consumer<MatchActor> onEnded;
    private final Actor<MatchEvent> actor;
    /** Armed timers, cancelled on {@link #close()} (which any thread may call). */
    private final Queue<Future<?>> pending = new ConcurrentLinkedQueue<>();
    /** The open question's {@code CloseWindow} timer, cancelled on an early close. Actor thread only. */
    private Future<?> closeTimer;
    private volatile boolean ended;
    /** The last broadcast {@code seq}, readable from any thread (for replies after the end). */
    private volatile long lastSeq;

    public MatchActor(MatchSetup setup, MatchState state, MatchSettings settings, Clock clock, MatchTimers timers,
            PlayerChannel channel, MatchBroadcaster broadcaster, BotBrain bots, MatchMetrics metrics,
            Consumer<MatchActor> onEnded) {
        this.setup = setup;
        this.state = state;
        this.settings = settings;
        this.clock = clock;
        this.timers = timers;
        this.channel = channel;
        this.broadcaster = broadcaster;
        this.bots = bots;
        this.metrics = metrics;
        this.onEnded = onEnded;
        this.actor = new Actor<>("match-" + setup.matchId().toString().substring(0, 8), this::handle);
    }

    public UUID matchId() {
        return setup.matchId();
    }

    public MatchSetup setup() {
        return setup;
    }

    /** {@code sub}'s participant id, if she is a human of this match (thread-safe: the setup is immutable). */
    public Optional<UUID> participantIdOf(String sub) {
        return Optional.ofNullable(setup.humans().get(sub));
    }

    public boolean isEnded() {
        return ended;
    }

    /** Whether the match reached its last reveal (false when an error ended it early). Actor thread only. */
    public boolean isCompleted() {
        return state.phase() == MatchPhase.ENDED;
    }

    /** The {@code seq} of the last broadcast sent. */
    public long lastSeq() {
        return lastSeq;
    }

    public void tell(MatchEvent event) {
        actor.tell(event);
    }

    private void handle(MatchEvent event) {
        if (ended) {
            return;
        }
        try {
            switch (event) {
                case MatchEvent.Begin begin -> after(settings.leadIn(), due -> new MatchEvent.NextQuestion(0, due));
                case MatchEvent.NextQuestion next -> openQuestion(next);
                case MatchEvent.Answer answer -> onAnswer(answer, answer.receivedAt());
                // A bot's answer is an ordinary answer, stamped when its timer fired.
                case MatchEvent.BotAnswer bot -> onAnswer(new MatchEvent.Answer(bot.participantId(), bot.index(),
                        bot.optionIndex(), bot.firedAt(), null), bot.firedAt());
                case MatchEvent.CloseWindow close -> closeWindow(close);
                case MatchEvent.Disconnect disconnect -> participantIdOf(disconnect.sub()).ifPresent(state::disconnect);
            }
        } catch (RuntimeException e) {
            // A match that cannot go on must not hold its players forever.
            log.atError().addKeyValue("matchId", matchId()).setCause(e)
                    .log("match failed on {}; ending it", event.getClass().getSimpleName());
            end();
        }
    }

    private void openQuestion(MatchEvent.NextQuestion next) {
        Instant now = clock.instant();
        ServerMessage<QuestionStartedPayload> started = state.startQuestion(next.index(), now);
        broadcast(started, next.dueAt());
        int index = next.index();
        InternalQuestion question = state.question(index);
        for (MatchParticipant participant : state.participants()) {
            if (participant.participant().kind() != ParticipantKind.BOT) {
                continue;
            }
            UUID botId = participant.participantId();
            bots.decide(question).ifPresent(move -> pending.add(timers.schedule(move.delay(),
                    () -> actor.tell(new MatchEvent.BotAnswer(botId, index, move.optionIndex(), clock.instant())))));
        }
        Instant closeAt = state.deadline().plus(settings.closeGrace());
        closeTimer = at(closeAt, new MatchEvent.CloseWindow(index, closeAt));
    }

    private void onAnswer(MatchEvent.Answer answer, Instant trigger) {
        Instant now = clock.instant();
        AnswerOutcome outcome = state.answer(answer.participantId(), answer.questionIndex(), answer.optionIndex(),
                answer.receivedAt(), now);
        MatchEvent.ReplyTo replyTo = answer.replyTo();
        switch (outcome) {
            case AnswerOutcome.Accepted accepted -> {
                if (replyTo != null) {
                    channel.toPlayer(replyTo.sub(), accepted.ack());
                    metrics.ack(answer.receivedAt(), clock.instant());
                }
                broadcast(accepted.scoreboard(), trigger);
                if (state.allAnswered()) {
                    closeEarly();
                }
            }
            case AnswerOutcome.Rejected rejected -> {
                if (replyTo != null) {
                    channel.toSession(replyTo.sub(), replyTo.sessionId(), rejected.error());
                }
            }
            case AnswerOutcome.Duplicate duplicate -> {
                // Only the first answer counts; a later one changes nothing and gets no reply.
            }
        }
    }

    /**
     * Everyone still in the match has answered: cancel the deadline timer and close now, exactly as
     * a timed close. Should the timer fire anyway, {@link MatchState#closeWindow} ignores it as stale.
     */
    private void closeEarly() {
        if (closeTimer != null) {
            closeTimer.cancel(false);
            closeTimer = null;
        }
        closeWindow(new MatchEvent.CloseWindow(state.currentIndex(), clock.instant()));
    }

    private void closeWindow(MatchEvent.CloseWindow close) {
        Optional<ServerMessage<QuestionRevealedPayload>> reveal = state.closeWindow(close.index(), clock.instant());
        if (reveal.isEmpty()) {
            return; // a stale timer
        }
        broadcast(reveal.get(), close.dueAt());
        if (state.phase() == MatchPhase.ENDED) {
            log.atInfo().addKeyValue("matchId", matchId()).log("match ended after {} questions", state.total());
            end();
        } else {
            int nextIndex = close.index() + 1;
            after(settings.revealHold(), due -> new MatchEvent.NextQuestion(nextIndex, due));
        }
    }

    private void broadcast(ServerMessage<?> message, Instant trigger) {
        broadcaster.broadcast(matchId(), message);
        lastSeq = message.seq();
        metrics.broadcast(message.type(), trigger, clock.instant());
    }

    /** Tells the event {@code delay} from now; it carries its due instant (for the lag meter). */
    private void after(Duration delay, Function<Instant, MatchEvent> event) {
        pending.removeIf(Future::isDone);
        Instant due = clock.instant().plus(delay);
        MatchEvent toTell = event.apply(due);
        pending.add(timers.schedule(delay, () -> actor.tell(toTell)));
    }

    private Future<?> at(Instant due, MatchEvent event) {
        Duration delay = Duration.between(clock.instant(), due);
        Future<?> timer = timers.schedule(delay.isNegative() ? Duration.ZERO : delay, () -> actor.tell(event));
        pending.add(timer);
        return timer;
    }

    private void end() {
        if (ended) {
            return;
        }
        ended = true;
        try {
            onEnded.accept(this);
        } finally {
            close();
        }
    }

    /** The state, for tests that read it once the actor is idle or ended. */
    MatchState state() {
        return state;
    }

    /** Cancels pending timers and stops the actor (queued events are dropped). */
    @Override
    public void close() {
        ended = true;
        for (Future<?> timer = pending.poll(); timer != null; timer = pending.poll()) {
            timer.cancel(false);
        }
        actor.close();
    }
}
