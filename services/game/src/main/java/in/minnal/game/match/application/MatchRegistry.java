package in.minnal.game.match.application;

import in.minnal.contracts.realtime.AnswerRequest;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.domain.MatchParticipant;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.match.domain.MatchState;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.LastSessionClosed;
import in.minnal.game.platform.session.MatchAccess;
import in.minnal.game.platform.session.MatchBroadcaster;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.PlayerSessions;
import in.minnal.game.platform.session.SessionOpened;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The live matches. {@link #start} creates a {@link MatchActor}, moves its humans to
 * {@code IN_MATCH} and begins it; when it ends (after its last reveal) it is removed and its humans
 * are free to join again. A disconnect arms the participant's reconnect grace, a new session
 * cancels it; a forfeit (grace expiry or {@link #leave}) releases her at once, while the match goes on
 * for the others (Story 1.9). {@link #resync} answers a reconnecting player with a {@code SNAPSHOT}.
 *
 * <p>An ended match stays resolvable for {@link #TOMBSTONE_TTL} (30 s), so its players' late
 * answers get {@code ANSWER_REJECTED} rather than {@code NOT_IN_MATCH}.
 *
 * <p>When a completed QUICK match ends, {@link MatchCompletedForRematch} is published so its rematch
 * window opens (Story 1.10); the actor itself still closes at the end.
 *
 * <p>Once draining has begun, {@link #start} refuses new matches. The check and the registration
 * happen under the same monitor {@link #awaitNoLiveMatches} reads under, so a match either counts
 * for the drain or never starts.
 */
@Component
public class MatchRegistry implements MatchAccess, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(MatchRegistry.class);

    static final Duration TOMBSTONE_TTL = Duration.ofSeconds(30);

    /** An ended match: who played it, its last broadcast seq, and when to forget it. */
    private record Tombstone(Set<String> humans, long lastSeq, long expiresAtNanos) {
    }

    private final ConcurrentHashMap<UUID, MatchActor> live = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Tombstone> tombstones = new ConcurrentHashMap<>();
    private final Object idle = new Object();
    private final DrainState drain;
    private final ParticipationRegistry participation;
    private final PlayerSessions sessions;
    private final PlayerChannel channel;
    private final MatchBroadcaster broadcaster;
    private final Clock clock;
    private final MatchTimers timers;
    private final MatchSettings settings;
    private final BotBrain bots;
    private final MatchMetrics metrics;
    private final MatchCompletedPublisher publisher;
    private final ApplicationEventPublisher events;

    public MatchRegistry(ParticipationRegistry participation, PlayerSessions sessions, PlayerChannel channel,
            MatchBroadcaster broadcaster, Clock clock, MatchTimers timers, MatchSettings settings, BotBrain bots,
            DrainState drain, MeterRegistry meters, MatchCompletedPublisher publisher) {
        this(participation, sessions, channel, broadcaster, clock, timers, settings, bots, drain, meters, publisher,
                event -> { });
    }

    /**
     * @param events where {@link MatchCompletedForRematch} goes when a completed QUICK match ends
     */
    @Autowired
    public MatchRegistry(ParticipationRegistry participation, PlayerSessions sessions, PlayerChannel channel,
            MatchBroadcaster broadcaster, Clock clock, MatchTimers timers, MatchSettings settings, BotBrain bots,
            DrainState drain, MeterRegistry meters, MatchCompletedPublisher publisher, ApplicationEventPublisher events) {
        this.publisher = publisher;
        this.events = events;
        this.drain = drain;
        this.participation = participation;
        this.sessions = sessions;
        this.channel = channel;
        this.broadcaster = broadcaster;
        this.clock = clock;
        this.timers = timers;
        this.settings = settings;
        this.bots = bots;
        this.metrics = new MatchMetrics(meters);
    }

    /**
     * Creates and registers the match, moves its humans to {@code IN_MATCH} and tells it to begin.
     *
     * @return the match, or empty when draining (nothing was started)
     */
    public Optional<MatchActor> start(MatchSetup setup) {
        MatchActor match;
        synchronized (idle) {
            if (drain.isDraining()) {
                return Optional.empty();
            }
            MatchState state = MatchState.of(setup, settings.window(), sessions::hasSession);
            UUID matchId = setup.matchId();
            match = new MatchActor(setup, state, settings, clock, timers, channel, broadcaster, bots, metrics, this::ended,
                    sessions::hasSession, sub -> participation.release(sub, new Activity.InMatch(matchId)), publisher);
            live.put(setup.matchId(), match);
        }
        for (String sub : setup.humans().keySet()) {
            participation.replace(sub, new Activity.InMatch(setup.matchId()));
        }
        match.tell(new MatchEvent.Begin());
        return Optional.of(match);
    }

    public Optional<MatchActor> find(UUID matchId) {
        return Optional.ofNullable(live.get(matchId));
    }

    /** How many matches are live. */
    public int liveCount() {
        return live.size();
    }

    @Override
    public Optional<UUID> participantId(UUID matchId, String sub) {
        return find(matchId).flatMap(match -> match.participantIdOf(sub));
    }

    /**
     * An answer from {@code sub}'s session, stamped {@code receivedAt} on arrival. A player of a match
     * that has ended (within the last 30 s) gets {@code ERROR ANSWER_REJECTED}; a sender who is not a
     * human of that match gets {@code ERROR NOT_IN_MATCH}; otherwise it goes to the match actor,
     * which decides.
     */
    public void answer(String sub, String sessionId, String matchIdText, AnswerRequest request, Instant receivedAt) {
        UUID matchId = parse(matchIdText);
        pruneTombstones();
        Tombstone tombstone = matchId == null ? null : tombstones.get(matchId);
        if (tombstone != null && tombstone.humans().contains(sub)) {
            rejectLate(sub, sessionId, matchId, tombstone.lastSeq());
            return;
        }
        MatchActor match = matchId == null ? null : live.get(matchId);
        if (match != null && match.isEnded() && match.participantIdOf(sub).isPresent()) {
            rejectLate(sub, sessionId, matchId, match.lastSeq());
            return;
        }
        Optional<UUID> participantId = match == null ? Optional.empty() : match.participantIdOf(sub);
        if (participantId.isEmpty()) {
            channel.toSession(sub, sessionId, ServerMessage.error(ErrorCode.NOT_IN_MATCH, matchId, clock.instant()));
            return;
        }
        AnswerRequest body = request == null ? new AnswerRequest(null, null) : request;
        match.tell(new MatchEvent.Answer(participantId.get(), body.questionIndex(), body.optionIndex(), receivedAt,
                new MatchEvent.ReplyTo(sub, sessionId)));
    }

    /**
     * A {@code resync} from {@code sub}'s session: the match answers that session with a
     * {@code SNAPSHOT}. A match she is not in, or one that has ended, gets {@code ERROR NOT_IN_MATCH}.
     */
    public void resync(String sub, String sessionId, String matchIdText) {
        UUID matchId = parse(matchIdText);
        MatchActor match = matchId == null ? null : live.get(matchId);
        if (match == null || match.isEnded() || match.participantIdOf(sub).isEmpty()) {
            channel.toSession(sub, sessionId, ServerMessage.error(ErrorCode.NOT_IN_MATCH, matchId, clock.instant()));
            return;
        }
        match.tell(new MatchEvent.Resync(sub, sessionId));
    }

    /** {@code sub} leaves the match on purpose: she forfeits at once. Ignored from a non-participant. */
    public void leave(String sub, String matchIdText) {
        UUID matchId = parse(matchIdText);
        MatchActor match = matchId == null ? null : live.get(matchId);
        if (match != null && match.participantIdOf(sub).isPresent()) {
            match.tell(new MatchEvent.Leave(sub));
        }
    }

    private void rejectLate(String sub, String sessionId, UUID matchId, long lastSeq) {
        channel.toSession(sub, sessionId, ServerMessage.error(ErrorCode.ANSWER_REJECTED, matchId, lastSeq, clock.instant()));
    }

    private void pruneTombstones() {
        long now = System.nanoTime();
        tombstones.values().removeIf(t -> now - t.expiresAtNanos() >= 0);
    }

    @EventListener
    void onLastSessionClosed(LastSessionClosed event) {
        participation.matchOf(event.sub()).flatMap(this::find)
                .ifPresent(match -> match.tell(new MatchEvent.Disconnect(event.sub())));
    }

    @EventListener
    void onSessionOpened(SessionOpened event) {
        participation.matchOf(event.sub()).flatMap(this::find)
                .ifPresent(match -> match.tell(new MatchEvent.Reconnected(event.sub())));
    }

    /** On the match's own thread, after its last reveal (or an abort, or an error): remove it and free its humans. */
    private void ended(MatchActor match) {
        UUID matchId = match.matchId();
        if (live.get(matchId) != match) {
            return;
        }
        // Release first: once a match is no longer live, its players are already free.
        for (String sub : match.setup().humans().keySet()) {
            participation.release(sub, new Activity.InMatch(matchId));
        }
        if (match.isFailed()) {
            metrics.failed();
        } else if (match.isAborted()) {
            metrics.aborted();
        } else if (match.isCompleted()) {
            metrics.ended();
        } else {
            metrics.failed();
        }
        tombstones.put(matchId, new Tombstone(Set.copyOf(match.setup().humans().keySet()), match.lastSeq(),
                System.nanoTime() + TOMBSTONE_TTL.toNanos()));
        synchronized (idle) {
            live.remove(matchId, match);
            idle.notifyAll();
        }
        log.atInfo().addKeyValue("matchId", matchId).log("match removed; players released");
        if (!match.isFailed() && !match.isAborted() && match.isCompleted() && match.setup().mode() == MatchMode.QUICK) {
            openRematchWindow(match);
        }
    }

    /** A completed QUICK match: its rematch window opens (Story 1.10). A failure here never blocks the end. */
    private void openRematchWindow(MatchActor match) {
        try {
            Set<UUID> forfeited = new HashSet<>();
            for (MatchParticipant participant : match.state().participants()) {
                if (participant.forfeited()) {
                    forfeited.add(participant.participantId());
                }
            }
            events.publishEvent(new MatchCompletedForRematch(match.setup(), forfeited, clock.instant()));
        } catch (RuntimeException e) {
            log.atWarn().addKeyValue("matchId", match.matchId()).setCause(e).log("could not open the rematch window");
        }
    }

    /** Waits until no match is live, or {@code timeout} passes; returns whether none is. */
    public boolean awaitNoLiveMatches(Duration timeout) throws InterruptedException {
        long deadline = System.nanoTime() + timeout.toNanos();
        synchronized (idle) {
            while (!live.isEmpty()) {
                long left = deadline - System.nanoTime();
                if (left <= 0) {
                    return false;
                }
                idle.wait(Math.max(1, left / 1_000_000));
            }
            return true;
        }
    }

    private static UUID parse(String text) {
        try {
            return text == null ? null : UUID.fromString(text);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @Override
    public void destroy() {
        live.values().forEach(MatchActor::close);
        live.clear();
    }
}
