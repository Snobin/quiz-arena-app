package in.minnal.game.room.application;

import in.minnal.contracts.realtime.RoomClosedReason;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.LastSessionClosed;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.PlayerSessions;
import in.minnal.game.platform.session.RoomAccess;
import in.minnal.game.platform.session.RoomBroadcaster;
import in.minnal.game.platform.session.SessionOpened;
import in.minnal.game.room.domain.RoomCodes;
import in.minnal.game.room.domain.RoomConfigRules;
import in.minnal.game.room.domain.RoomState;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;

/**
 * The live Battle Rooms and their code registry (Story 5.1): room id to actor, and code to room id, both in memory (a
 * crash loses them, accepted). {@link #open} is the one place a room comes to exist: under one monitor it checks
 * draining and the {@code minnal.room.max-live} cap, claims the host's {@code sub} for the room, draws a code no live
 * room has, and starts the actor. A room that closes reports back here, which frees the code and every member's
 * {@code sub} and lowers the live gauge.
 *
 * <p>A draining service closes its open lobbies at once ({@code ROOM_CLOSED SERVER_DRAINING}); hosts re-create.
 * Codes are never logged.
 */
@Component
public class RoomRegistry implements RoomAccess, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(RoomRegistry.class);

    /** How long a drain waits for the closing rooms to say so, before shutdown goes on. */
    private static final Duration DRAIN_WAIT = Duration.ofSeconds(2);

    /** What {@link #open} did. */
    sealed interface Opening {
        /** The room exists and its host is in it. */
        record Opened(UUID roomId) implements Opening {
        }

        /** The host already holds another activity. */
        record Busy(Activity held) implements Opening {
        }

        /** {@code max-live} rooms are open. */
        record Full() implements Opening {
        }

        /** The service is draining. */
        record Draining() implements Opening {
        }
    }

    private final Map<UUID, RoomActor> rooms = new HashMap<>();
    private final Map<String, UUID> codes = new HashMap<>();
    private final DrainState drain;
    private final ParticipationRegistry participation;
    private final PlayerSessions sessions;
    private final PlayerChannel channel;
    private final RoomBroadcaster broadcaster;
    private final Clock clock;
    private final RoomTimers timers;
    private final RoomSettings settings;
    private final RoomCodes roomCodes;
    private final RoomMetrics metrics;

    public RoomRegistry(DrainState drain, ParticipationRegistry participation, PlayerSessions sessions,
            PlayerChannel channel, RoomBroadcaster broadcaster, Clock clock, RoomTimers timers, RoomSettings settings,
            RoomCodes roomCodes, MeterRegistry meters) {
        this.drain = drain;
        this.participation = participation;
        this.sessions = sessions;
        this.channel = channel;
        this.broadcaster = broadcaster;
        this.clock = clock;
        this.timers = timers;
        this.settings = settings;
        this.roomCodes = roomCodes;
        this.metrics = new RoomMetrics(meters, this::liveCount);
        drain.onBegin(this::closeAllForDrain);
    }

    /**
     * Opens a lobby for {@code host} with {@code config}: she becomes its first participant (name from her token) and her
     * {@code ROOM_JOINED} follows from the actor.
     */
    synchronized Opening open(MinnalPrincipal host, RoomConfigRules.Config config) {
        if (drain.isDraining()) {
            return new Opening.Draining();
        }
        if (rooms.size() >= settings.maxLive()) {
            return new Opening.Full();
        }
        UUID roomId = UUID.randomUUID();
        Optional<Activity> held = participation.claim(host.sub(), new Activity.InRoom(roomId));
        if (held.isPresent()) {
            return new Opening.Busy(held.get());
        }
        RoomActor room;
        try {
            String code = roomCodes.draw(codes::containsKey);
            Instant now = clock.instant();
            String name = host.name() == null || host.name().isBlank() ? "Player" : host.name();
            RoomState state = new RoomState(roomId, code, host.sub(), name, config, now, now.plus(settings.ttl()));
            room = new RoomActor(state, settings, clock, timers, channel, broadcaster, sessions::hasSession, this::closed);
            codes.put(code, roomId);
            rooms.put(roomId, room);
        } catch (RuntimeException e) {
            participation.release(host.sub(), new Activity.InRoom(roomId));
            throw e;
        }
        metrics.created();
        log.atInfo().addKeyValue("roomId", roomId).addKeyValue("userId", host.sub()).log("room created");
        room.tell(new RoomEvent.Begin());
        return new Opening.Opened(roomId);
    }

    synchronized Optional<RoomActor> find(UUID roomId) {
        return Optional.ofNullable(rooms.get(roomId));
    }

    /** The room that has {@code code} (canonical), if it is live (Story 5.3's join). */
    synchronized Optional<RoomActor> findByCode(String code) {
        return Optional.ofNullable(codes.get(code)).map(rooms::get);
    }

    /** How many rooms are live. */
    public synchronized int liveCount() {
        return rooms.size();
    }

    @Override
    public boolean isMember(UUID roomId, String sub) {
        return find(roomId).map(room -> room.isMember(sub)).orElse(false);
    }

    /** On the room's own thread, as it closes: free the code and its players. The maps come first so nothing can leak. */
    private void closed(RoomActor room, RoomClosedReason reason) {
        synchronized (this) {
            rooms.remove(room.roomId(), room);
            codes.remove(room.code(), room.roomId());
            notifyAll();
        }
        metrics.closed();
        try {
            for (String sub : room.memberSubsAtClose()) {
                try {
                    participation.release(sub, new Activity.InRoom(room.roomId()));
                } catch (RuntimeException e) {
                    log.atError().addKeyValue("roomId", room.roomId()).setCause(e).log("could not release a room member");
                }
            }
        } catch (RuntimeException e) {
            log.atError().addKeyValue("roomId", room.roomId()).setCause(e).log("could not list the room's members");
        }
        log.atInfo().addKeyValue("roomId", room.roomId()).addKeyValue("userId", room.hostSub())
                .addKeyValue("reason", reason).log("room closed");
    }

    private void closeAllForDrain() {
        List<RoomActor> open;
        synchronized (this) {
            open = new ArrayList<>(rooms.values());
        }
        open.forEach(room -> room.tell(new RoomEvent.Drain()));
        long deadline = System.nanoTime() + DRAIN_WAIT.toNanos();
        synchronized (this) {
            try {
                while (!rooms.isEmpty()) {
                    long left = deadline - System.nanoTime();
                    if (left <= 0) {
                        log.warn("drain: {} room(s) did not close in {}", rooms.size(), DRAIN_WAIT);
                        return;
                    }
                    wait(Math.max(1, left / 1_000_000));
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private Optional<RoomActor> roomOf(String sub) {
        return participation.activityOf(sub)
                .filter(Activity.InRoom.class::isInstance)
                .flatMap(a -> find(((Activity.InRoom) a).roomId()));
    }

    @EventListener
    void onLastSessionClosed(LastSessionClosed event) {
        roomOf(event.sub()).ifPresent(room -> room.tell(new RoomEvent.Disconnected(event.sub())));
    }

    @EventListener
    void onSessionOpened(SessionOpened event) {
        roomOf(event.sub()).ifPresent(room -> room.tell(new RoomEvent.Reconnected(event.sub())));
    }

    /**
     * A session subscribed to its private queue: if its player is in a room, it gets {@code ROOM_JOINED} with the room as
     * it stands (a host who reconnected, Story 5.1). Sending at connect would be too early: nothing is subscribed yet.
     */
    @EventListener
    void onSubscribed(SessionSubscribeEvent event) {
        if (event.getUser() == null) {
            return;
        }
        String destination = SimpMessageHeaderAccessor.getDestination(event.getMessage().getHeaders());
        String sessionId = SimpMessageHeaderAccessor.getSessionId(event.getMessage().getHeaders());
        if (!"/user/queue/game".equals(destination) || sessionId == null) {
            return;
        }
        String sub = event.getUser().getName();
        roomOf(sub).ifPresent(room -> room.tell(new RoomEvent.Announce(sub, sessionId)));
    }

    @Override
    public void destroy() {
        List<RoomActor> open;
        synchronized (this) {
            open = new ArrayList<>(rooms.values());
            rooms.clear();
            codes.clear();
        }
        open.forEach(RoomActor::close);
    }
}
