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
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

/**
 * The join gate and the matchmaking actors (AD-13). One actor per mode; only {@code QUICK} exists
 * until Epics 4/5. A ticker sends each actor a TICK every 250 ms.
 *
 * <p>The gate, in order: draining → {@code SERVER_DRAINING}; unknown mode → {@code BAD_REQUEST};
 * a guest on anything but QUICK → {@code FORBIDDEN_MODE}; a registered player on TOPIC_DUEL or
 * BATTLE_ROOM → {@code MODE_UNAVAILABLE}; already queued or in a match → {@code ALREADY_IN_MATCH}
 * (with the matchId when in one); otherwise the claim is taken and a JOIN goes to the actor.
 */
@Service
public class MatchmakingService implements DisposableBean {

    private final DrainState drain;
    private final ParticipationRegistry participation;
    private final PlayerChannel channel;
    private final Clock clock;
    private final RematchCoordinator rematches;
    private final DeletedUsers deleted;
    private final Map<MatchMode, MatchmakingActor> actors = new EnumMap<>(MatchMode.class);
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().name("matchmaking-ticker").daemon(true).factory());

    public MatchmakingService(DrainState drain, ParticipationRegistry participation, PlayerSessions sessions,
            PlayerChannel channel, Clock clock, RatingCache ratings, QuestionSetClient questionSets,
            MatchRegistry matches, MeterRegistry meters, RematchCoordinator rematches, DeletedUsers deleted,
            @Value("${minnal.matchmaking.tick:250ms}") Duration tick,
            @Value("${minnal.matchmaking.widen-after:4s}") Duration widenAfter,
            @Value("${minnal.matchmaking.bot-after:8s}") Duration botAfter) {
        this.drain = drain;
        this.participation = participation;
        this.channel = channel;
        this.clock = clock;
        this.rematches = rematches;
        this.deleted = deleted;
        MatchmakingRules rules = new MatchmakingRules(MatchmakingRules.DEFAULT.band(), MatchmakingRules.DEFAULT.widenedBand(),
                widenAfter, botAfter);
        actors.put(MatchMode.QUICK, new MatchmakingActor(MatchMode.QUICK, new MatchmakingQueue(rules), clock, ratings,
                participation, sessions, channel, questionSets, matches, meters));
        ticker.scheduleAtFixedRate(() -> actors.values().forEach(a -> a.tell(new MatchmakingEvent.Tick())),
                tick.toMillis(), tick.toMillis(), TimeUnit.MILLISECONDS);
    }

    public void join(MinnalPrincipal player, String sessionId, String modeName) {
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
        MatchmakingActor actor = actors.get(mode);
        if (actor == null) {
            reject(player, sessionId, ErrorCode.MODE_UNAVAILABLE, null);
            return;
        }
        Optional<Activity> held = participation.claim(player.sub(), new Activity.Queued(mode));
        if (held.isPresent()) {
            reject(player, sessionId, ErrorCode.ALREADY_IN_MATCH,
                    held.get() instanceof Activity.InMatch(var matchId) ? matchId : null);
            return;
        }
        actor.tell(new MatchmakingEvent.Join(player, sessionId));
        // Queued now: a pending rematch with her can no longer happen (Story 1.10).
        rematches.joinedMatchmaking(player.sub());
    }

    public void cancel(MinnalPrincipal player, String sessionId, String modeName) {
        MatchMode mode = parse(modeName).orElse(null);
        if (mode == null) {
            reject(player, sessionId, ErrorCode.BAD_REQUEST, null);
            return;
        }
        MatchmakingActor actor = actors.get(mode);
        if (actor == null) {
            reject(player, sessionId, ErrorCode.NOT_IN_QUEUE, null);
            return;
        }
        actor.tell(new MatchmakingEvent.Cancel(player.sub(), sessionId));
    }

    @EventListener
    void onLastSessionClosed(LastSessionClosed event) {
        actors.values().forEach(actor -> actor.tell(new MatchmakingEvent.Disconnect(event.sub())));
    }

    private void reject(MinnalPrincipal player, String sessionId, ErrorCode code, UUID matchId) {
        channel.toSession(player.sub(), sessionId, ServerMessage.error(code, matchId, clock.instant()));
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
        actors.values().forEach(MatchmakingActor::close);
    }
}
