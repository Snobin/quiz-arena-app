package in.minnal.game.match.application;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.AbortReason;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ParticipantForfeitedPayload;
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
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Predicate;
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
 *
 * <p>Resilience (Story 1.9): when a player's last session closes she is {@code DISCONNECTED} and a
 * reconnect grace is armed ({@code GraceExpired} carries an epoch, so a stale timer is a no-op); a
 * new session cancels it. When the grace runs out, or she leaves, she forfeits: the forfeit is
 * broadcast, she is released ({@code onForfeited}), and the open question may close early. If every
 * human has gone, the match is aborted before the Q1 reveal ({@code MATCH_ABORTED{ALL_LEFT}}) or
 * finished at once after it (completed). A handler exception broadcasts {@code MATCH_ABORTED{ERROR}}.
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
    private final Predicate<String> hasSession;
    private final Consumer<String> onForfeited;
    private final Actor<MatchEvent> actor;
    /** Armed timers, cancelled on {@link #close()} (which any thread may call). */
    private final Queue<Future<?>> pending = new ConcurrentLinkedQueue<>();
    /** The open question's {@code CloseWindow} timer, cancelled on an early close. Actor thread only. */
    private Future<?> closeTimer;
    /** Each human's current grace epoch (bumped on every disconnect and reconnect). Actor thread only. */
    private final Map<String, Long> graceEpochs = new HashMap<>();
    /** Each human's armed grace timer, cancelled on a reconnect. Actor thread only. */
    private final Map<String, Future<?>> graceTimers = new HashMap<>();
    private volatile boolean failed;
    private volatile boolean aborted;
    private volatile boolean ended;
    /** The last broadcast {@code seq}, readable from any thread (for replies after the end). */
    private volatile long lastSeq;

    public MatchActor(MatchSetup setup, MatchState state, MatchSettings settings, Clock clock, MatchTimers timers,
            PlayerChannel channel, MatchBroadcaster broadcaster, BotBrain bots, MatchMetrics metrics,
            Consumer<MatchActor> onEnded) {
        this(setup, state, settings, clock, timers, channel, broadcaster, bots, metrics, onEnded, sub -> false,
                sub -> { });
    }

    /**
     * @param hasSession  whether {@code sub} has an open session right now (checked when her grace
     *                    runs out, in case a reconnect raced her disconnect)
     * @param onForfeited called on the actor thread with the {@code sub} of a human who forfeited
     *                    (to release her from {@code IN_MATCH})
     */
    public MatchActor(MatchSetup setup, MatchState state, MatchSettings settings, Clock clock, MatchTimers timers,
            PlayerChannel channel, MatchBroadcaster broadcaster, BotBrain bots, MatchMetrics metrics,
            Consumer<MatchActor> onEnded, Predicate<String> hasSession, Consumer<String> onForfeited) {
        this.hasSession = hasSession;
        this.onForfeited = onForfeited;
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

    /** Whether the match counts as completed: Q1 was revealed (Story 1.9). Actor thread only. */
    public boolean isCompleted() {
        return state.q1Revealed();
    }

    /** Whether every human left before Q1 was revealed, so the match was aborted. */
    public boolean isAborted() {
        return aborted;
    }

    /** Whether an unexpected error ended the match. */
    public boolean isFailed() {
        return failed;
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
            if (event instanceof MatchEvent.Resync resync) {
                channel.toSession(resync.sub(), resync.sessionId(),
                        ServerMessage.error(ErrorCode.NOT_IN_MATCH, matchId(), clock.instant()));
            }
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
                case MatchEvent.Disconnect disconnect -> onDisconnect(disconnect.sub());
                case MatchEvent.Reconnected reconnected -> onReconnected(reconnected.sub());
                case MatchEvent.GraceExpired expired -> onGraceExpired(expired);
                case MatchEvent.Leave leave -> forfeit(leave.sub());
                case MatchEvent.Resync resync -> onResync(resync);
            }
        } catch (RuntimeException e) {
            // A match that cannot go on must not hold its players forever.
            log.atError().addKeyValue("matchId", matchId()).setCause(e)
                    .log("match failed on {}; ending it", event.getClass().getSimpleName());
            failed = true;
            try {
                broadcast(state.abort(AbortReason.ERROR, clock.instant()), clock.instant());
            } catch (RuntimeException abortFailure) {
                log.atWarn().addKeyValue("matchId", matchId()).setCause(abortFailure).log("could not broadcast the abort");
            }
            end();
        }
    }

    /** Her last session closed: {@code DISCONNECTED}, and the grace starts. */
    private void onDisconnect(String sub) {
        Optional<UUID> participantId = participantIdOf(sub);
        if (participantId.isEmpty() || !state.disconnect(participantId.get())) {
            return;
        }
        long epoch = bumpGrace(sub);
        Future<?> timer = timers.schedule(settings.grace(),
                () -> actor.tell(new MatchEvent.GraceExpired(sub, epoch)));
        pending.removeIf(Future::isDone);
        pending.add(timer);
        graceTimers.put(sub, timer);
        log.atInfo().addKeyValue("matchId", matchId()).log("a player disconnected; grace of {} armed", settings.grace());
    }

    /** A new session: {@code CONNECTED}, and any grace is cancelled. */
    private void onReconnected(String sub) {
        participantIdOf(sub).ifPresent(participantId -> {
            bumpGrace(sub);
            state.reconnect(participantId);
        });
    }

    private void onGraceExpired(MatchEvent.GraceExpired expired) {
        String sub = expired.sub();
        if (graceEpochs.getOrDefault(sub, 0L) != expired.epoch()) {
            return; // a stale timer: she came back (or dropped again) since it was armed
        }
        if (hasSession.test(sub)) {
            // A reconnect raced the disconnect: she is here after all.
            onReconnected(sub);
            return;
        }
        log.atInfo().addKeyValue("matchId", matchId()).log("a player's reconnect grace ran out");
        forfeit(sub);
    }

    /** Invalidates (and cancels) her armed grace timer; returns the new epoch. */
    private long bumpGrace(String sub) {
        Future<?> timer = graceTimers.remove(sub);
        if (timer != null) {
            timer.cancel(false);
        }
        long epoch = graceEpochs.getOrDefault(sub, 0L) + 1;
        graceEpochs.put(sub, epoch);
        return epoch;
    }

    /**
     * Forfeit (idempotent): broadcast it, release her, then either end the match (every human gone)
     * or close the open question early if everyone left in it has answered.
     */
    private void forfeit(String sub) {
        Optional<UUID> participantId = participantIdOf(sub);
        if (participantId.isEmpty()) {
            return;
        }
        Instant now = clock.instant();
        Optional<ServerMessage<ParticipantForfeitedPayload>> forfeited = state.forfeit(participantId.get(), now);
        if (forfeited.isEmpty()) {
            return;
        }
        bumpGrace(sub);
        broadcast(forfeited.get(), now);
        onForfeited.accept(sub);
        if (state.humansAllForfeited()) {
            if (!state.q1Revealed()) {
                log.atInfo().addKeyValue("matchId", matchId()).log("every human left before the first reveal; aborting");
                aborted = true;
                broadcast(state.abort(AbortReason.ALL_LEFT, clock.instant()), now);
                end();
            } else {
                finishNow();
            }
        } else if (state.allAnswered()) {
            closeEarly();
        }
    }

    /**
     * Every human has gone after Q1 was revealed: close the open question at once (as an early
     * close), score the rest 0 with no timers and end the match as completed.
     */
    private void finishNow() {
        if (closeTimer != null) {
            closeTimer.cancel(false);
            closeTimer = null;
        }
        Instant now = clock.instant();
        state.finishNow(now).ifPresent(reveal -> broadcast(reveal, now));
        log.atInfo().addKeyValue("matchId", matchId()).log("every human has gone; match finished early");
        end();
    }

    private void onResync(MatchEvent.Resync resync) {
        Optional<UUID> participantId = participantIdOf(resync.sub());
        if (participantId.isEmpty()) {
            channel.toSession(resync.sub(), resync.sessionId(),
                    ServerMessage.error(ErrorCode.NOT_IN_MATCH, matchId(), clock.instant()));
            return;
        }
        // Asking for a snapshot means she has a session: no grace applies any more.
        onReconnected(resync.sub());
        channel.toSession(resync.sub(), resync.sessionId(), state.snapshot(participantId.get(), clock.instant()));
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
