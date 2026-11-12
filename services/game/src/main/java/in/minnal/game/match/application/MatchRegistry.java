package in.minnal.game.match.application;

import in.minnal.contracts.realtime.AnswerRequest;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ServerMessage;
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
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The live matches. {@link #start} creates a {@link MatchActor}, moves its humans to
 * {@code IN_MATCH} and begins it; when it ends (after its last reveal) it is removed and its humans
 * are free to join again. A disconnect only marks the participant: the match always runs to the
 * end (grace, forfeit and abort: Story 1.9).
 *
 * <p>An ended match stays resolvable for {@link #TOMBSTONE_TTL} (30 s), so its players' late
 * answers get {@code ANSWER_REJECTED} rather than {@code NOT_IN_MATCH}.
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

    public MatchRegistry(ParticipationRegistry participation, PlayerSessions sessions, PlayerChannel channel,
            MatchBroadcaster broadcaster, Clock clock, MatchTimers timers, MatchSettings settings, BotBrain bots,
            DrainState drain, MeterRegistry meters) {
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
            match = new MatchActor(setup, state, settings, clock, timers, channel, broadcaster, bots, metrics, this::ended);
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

    /** On the match's own thread, after its last reveal (or an error): remove it and free its humans. */
    private void ended(MatchActor match) {
        UUID matchId = match.matchId();
        if (live.get(matchId) != match) {
            return;
        }
        // Release first: once a match is no longer live, its players are already free.
        for (String sub : match.setup().humans().keySet()) {
            participation.release(sub, new Activity.InMatch(matchId));
        }
        if (match.isCompleted()) {
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
