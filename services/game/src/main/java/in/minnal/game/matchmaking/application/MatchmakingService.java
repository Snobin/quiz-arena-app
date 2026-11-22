package in.minnal.game.matchmaking.application;

import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.matchmaking.domain.MatchmakingQueue;
import in.minnal.game.matchmaking.domain.MatchmakingRules;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.DeletedUsers;
import in.minnal.game.platform.session.LastSessionClosed;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.PlayerSessions;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

/**
 * The join gate and the matchmaking actors (AD-13). One actor per {@code (mode, topicId)}: the
 * Quick Match actor ({@code topicId} null) lives for good; a Topic Duel actor is created by the
 * first join on its topic and stopped after it has been empty for 60 s (Story 4.2). A ticker sends
 * each actor a TICK every 250 ms and reaps the idle ones.
 *
 * <p>The gate, in order: draining → {@code SERVER_DRAINING}; unknown mode → {@code BAD_REQUEST};
 * a guest on anything but QUICK → {@code FORBIDDEN_MODE}; BATTLE_ROOM → {@code MODE_UNAVAILABLE};
 * TOPIC_DUEL without a UUID {@code topicId} → {@code INVALID_TOPIC} (core is never asked: AD-2);
 * already queued, in a room or in a match → {@code ALREADY_IN_MATCH} (with the matchId or roomId when in one);
 * otherwise the claim is taken and a JOIN goes to the actor.
 */
@Service
public class MatchmakingService implements DisposableBean {

    /** One actor's identity: the mode, and the topic in Topic Duel (null otherwise). */
    private record Key(MatchMode mode, UUID topicId) {
    }

    private static final Logger LOG = LoggerFactory.getLogger(MatchmakingService.class);

    private final DrainState drain;
    private final ParticipationRegistry participation;
    private final PlayerSessions sessions;
    private final PlayerChannel channel;
    private final Clock clock;
    private final RatingCache ratings;
    private final QuestionSetClient questionSets;
    private final MatchRegistry matches;
    private final MeterRegistry meters;
    private final RematchCoordinator rematches;
    private final DeletedUsers deleted;
    private final MatchmakingRules rules;
    private final Duration idleAfter;
    private final int maxTopicActors;
    /** Guarded by {@code this}: joins and the idle reaper never interleave. */
    private final Map<Key, MatchmakingActor> actors = new HashMap<>();
    private volatile List<MatchmakingActor> snapshot = List.of();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().name("matchmaking-ticker").daemon(true).factory());

    public MatchmakingService(DrainState drain, ParticipationRegistry participation, PlayerSessions sessions,
            PlayerChannel channel, Clock clock, RatingCache ratings, QuestionSetClient questionSets,
            MatchRegistry matches, MeterRegistry meters, RematchCoordinator rematches, DeletedUsers deleted,
            @Value("${minnal.matchmaking.tick:250ms}") Duration tick,
            @Value("${minnal.matchmaking.widen-after:4s}") Duration widenAfter,
            @Value("${minnal.matchmaking.bot-after:8s}") Duration botAfter,
            @Value("${minnal.matchmaking.idle-after:60s}") Duration idleAfter,
            @Value("${minnal.matchmaking.max-topic-actors:200}") int maxTopicActors) {
        this.maxTopicActors = maxTopicActors;
        this.drain = drain;
        this.participation = participation;
        this.sessions = sessions;
        this.channel = channel;
        this.clock = clock;
        this.ratings = ratings;
        this.questionSets = questionSets;
        this.matches = matches;
        this.meters = meters;
        this.rematches = rematches;
        this.deleted = deleted;
        this.idleAfter = idleAfter;
        this.rules = new MatchmakingRules(MatchmakingRules.DEFAULT.band(), MatchmakingRules.DEFAULT.widenedBand(),
                widenAfter, botAfter);
        synchronized (this) {
            actorFor(new Key(MatchMode.QUICK, null));
        }
        ticker.scheduleAtFixedRate(this::tick, tick.toMillis(), tick.toMillis(), TimeUnit.MILLISECONDS);
    }

    /** The actor of {@code key}, created on first use. Caller holds the lock. */
    private MatchmakingActor actorFor(Key key) {
        MatchmakingActor actor = actors.get(key);
        if (actor == null) {
            actor = new MatchmakingActor(key.mode(), key.topicId(), new MatchmakingQueue(rules), clock, ratings,
                    participation, sessions, channel, questionSets, matches, meters);
            actors.put(key, actor);
            snapshot = List.copyOf(actors.values());
        }
        return actor;
    }

    private void tick() {
        // An exception must not escape: it would cancel every later tick of the shared scheduled task.
        try {
            snapshot.forEach(a -> a.tell(new MatchmakingEvent.Tick()));
            reapIdle();
        } catch (RuntimeException e) {
            LOG.error("matchmaking tick failed", e);
        }
    }

    /** Stops every Topic Duel actor that has been empty for the idle period; the next join recreates it. */
    synchronized void reapIdle() {
        boolean removed = actors.entrySet().removeIf(entry -> {
            if (entry.getKey().topicId() != null && entry.getValue().idleFor(idleAfter)) {
                entry.getValue().close();
                return true;
            }
            return false;
        });
        if (removed) {
            snapshot = List.copyOf(actors.values());
        }
    }

    /** Whether the Topic Duel actor of {@code topicId} exists (tests). */
    synchronized boolean hasTopicActor(UUID topicId) {
        return actors.containsKey(new Key(MatchMode.TOPIC_DUEL, topicId));
    }

    /** How many actors exist (tests). */
    synchronized int actorCount() {
        return actors.size();
    }

    public void join(MinnalPrincipal player, String sessionId, String modeName, String topicIdText) {
        join(player, sessionId, modeName, topicIdText, false);
    }

    /**
     * {@code customSource}: the join body named a custom source (Story 6.5a). Quick Match and Topic Duel have no custom
     * path (a player's own questions are only for Battle Rooms and Solo Practice), so it is {@code INVALID_TOPIC}.
     */
    public void join(MinnalPrincipal player, String sessionId, String modeName, String topicIdText, boolean customSource) {
        if (drain.isDraining()) {
            reject(player, sessionId, ErrorCode.SERVER_DRAINING, null);
            return;
        }
        if (deleted.contains(player.sub())) {
            reject(player, sessionId, ErrorCode.UNAUTHENTICATED, null);
            return;
        }
        MatchMode mode = parse(modeName).orElse(null);
        if (mode == null) {
            reject(player, sessionId, ErrorCode.BAD_REQUEST, null);
            return;
        }
        if (Matchmaking.isGuest(player) && mode != MatchMode.QUICK) {
            reject(player, sessionId, ErrorCode.FORBIDDEN_MODE, null);
            return;
        }
        if (mode == MatchMode.BATTLE_ROOM) {
            reject(player, sessionId, ErrorCode.MODE_UNAVAILABLE, null);
            return;
        }
        if (customSource) {
            reject(player, sessionId, ErrorCode.INVALID_TOPIC, null);
            return;
        }
        UUID topicId = null;
        if (mode == MatchMode.TOPIC_DUEL) {
            topicId = parseUuid(topicIdText);
            if (topicId == null) {
                reject(player, sessionId, ErrorCode.INVALID_TOPIC, null);
                return;
            }
        }
        Activity queued = new Activity.Queued(mode, topicId);
        synchronized (this) {
            // A new Topic Duel actor over the cap is refused; Quick actors are never counted.
            if (topicId != null && !actors.containsKey(new Key(mode, topicId))
                    && actors.keySet().stream().filter(k -> k.topicId() != null).count() >= maxTopicActors) {
                reject(player, sessionId, ErrorCode.MODE_UNAVAILABLE, null);
                return;
            }
            Optional<Activity> held = participation.claim(player.sub(), queued);
            if (held.isPresent()) {
                reject(player, sessionId, ErrorCode.ALREADY_IN_MATCH,
                        held.get() instanceof Activity.InMatch(var matchId) ? matchId : null,
                        held.get() instanceof Activity.InRoom(var roomId) ? roomId : null);
                return;
            }
            actorFor(new Key(mode, topicId)).tell(new MatchmakingEvent.Join(player, sessionId));
        }
        // Queued now: a pending rematch with her can no longer happen (Story 1.10).
        rematches.joinedMatchmaking(player.sub());
    }

    public void cancel(MinnalPrincipal player, String sessionId, String modeName) {
        MatchMode mode = parse(modeName).orElse(null);
        if (mode == null) {
            reject(player, sessionId, ErrorCode.BAD_REQUEST, null);
            return;
        }
        // The claim says which actor holds her (a topic is not sent on a cancel).
        Activity held = participation.activityOf(player.sub()).orElse(null);
        MatchmakingActor actor = null;
        if (held instanceof Activity.Queued(var queuedMode, var topicId) && queuedMode == mode) {
            synchronized (this) {
                actor = actors.get(new Key(mode, topicId));
            }
        }
        if (actor != null) {
            actor.tell(new MatchmakingEvent.Cancel(player.sub(), sessionId));
            return;
        }
        UUID matchId = held instanceof Activity.InMatch(var id) ? id : null;
        reject(player, sessionId, matchId != null ? ErrorCode.CANCEL_REJECTED : ErrorCode.NOT_IN_QUEUE, matchId);
    }

    @EventListener
    void onLastSessionClosed(LastSessionClosed event) {
        snapshot.forEach(actor -> actor.tell(new MatchmakingEvent.Disconnect(event.sub())));
    }

    private void reject(MinnalPrincipal player, String sessionId, ErrorCode code, UUID matchId) {
        reject(player, sessionId, code, matchId, null);
    }

    /** {@code roomId} is set when the player's claim is a Battle Room lobby (Story 5.1). */
    private void reject(MinnalPrincipal player, String sessionId, ErrorCode code, UUID matchId, UUID roomId) {
        channel.toSession(player.sub(), sessionId, ServerMessage.error(code, matchId, roomId, null, clock.instant()));
    }

    private static UUID parseUuid(String text) {
        try {
            return text == null ? null : UUID.fromString(text);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static Optional<MatchMode> parse(String name) {
        for (MatchMode mode : MatchMode.values()) {
            if (mode.name().equals(name)) {
                return Optional.of(mode);
            }
        }
        return Optional.empty();
    }

    @Override
    public void destroy() {
        ticker.shutdownNow();
        snapshot.forEach(MatchmakingActor::close);
    }
}
