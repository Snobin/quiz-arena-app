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
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
 * <p>Story 5.3: {@link #join} finds a live room by its canonical code and claims the joiner's {@code sub} for it before
 * the actor decides (full, started); every {@code sub} claimed for a room is remembered here until the room releases it
 * or closes, so a join still queued when a room closes leaks nothing. A closed room leaves a tombstone
 * {@code {code, reason, until: now + 24 h}}: a late join reads {@code ROOM_EXPIRED}, and the code is not drawn again
 * while it lives. Tombstones are in memory only (after a restart every old code reads {@code ROOM_NOT_FOUND}, AD-14).
 * A {@code sub} with {@value #MAX_FAILED_LOOKUPS} failed lookups (no live room for the code) in a rolling minute is
 * refused with {@code RATE_LIMITED} until the oldest of them is a minute old; successful joins never count.
 *
 * <p>A draining service closes its open lobbies at once ({@code ROOM_CLOSED SERVER_DRAINING}); hosts re-create.
 * Codes are never logged.
 */
@Component
public class RoomRegistry implements RoomAccess, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(RoomRegistry.class);

    /** How long a drain waits for the closing rooms to say so, before shutdown goes on. */
    private static final Duration DRAIN_WAIT = Duration.ofSeconds(2);

    /** How long a closed room's code is remembered (and not drawn again). */
    static final Duration TOMBSTONE_TTL = Duration.ofHours(24);
    /** Failed lookups allowed per {@code sub} in {@link #LOOKUP_WINDOW}; the next join is {@code RATE_LIMITED}. */
    static final int MAX_FAILED_LOOKUPS = 10;
    static final Duration LOOKUP_WINDOW = Duration.ofMinutes(1);

    /** A closed room's code: why it closed and until when it is remembered. */
    record Tombstone(String code, RoomClosedReason reason, Instant until) {
    }

    /** What {@link #join} did. */
    sealed interface Joining {
        /** The room has the join on its queue (it answers {@code ROOM_JOINED}, {@code ROOM_FULL} or {@code ROOM_STARTED}). */
        record Sent(UUID roomId) implements Joining {
        }

        /** No live room and no tombstone has this code (or it is no code at all). */
        record NotFound() implements Joining {
        }

        /** The code's room closed, expired or ended. */
        record Expired(RoomClosedReason reason) implements Joining {
        }

        /** The joiner already holds another activity. */
        record Busy(Activity held) implements Joining {
        }

        /** Too many failed lookups in the last minute. */
        record RateLimited() implements Joining {
        }

        /** The service is draining. */
        record Draining() implements Joining {
        }
    }

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
    /** Every {@code sub} claimed for a room (members and joins on its queue), until released or the room closes. */
    private final Map<UUID, Set<String>> claims = new HashMap<>();
    private final Map<String, Tombstone> tombstones = new HashMap<>();
    private final Map<String, Deque<Instant>> failedLookups = new HashMap<>();
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
            Instant now = clock.instant();
            pruneTombstones(now);
            String code = roomCodes.draw(candidate -> codes.containsKey(candidate) || tombstones.containsKey(candidate));
            String name = host.name() == null || host.name().isBlank() ? "Player" : host.name();
            RoomState state = new RoomState(roomId, code, host.sub(), name, config, now, now.plus(settings.ttl()));
            room = new RoomActor(state, settings, clock, timers, channel, broadcaster, sessions::hasSession,
                    this::released, this::closed);
            codes.put(code, roomId);
            rooms.put(roomId, room);
            claims.computeIfAbsent(roomId, id -> new HashSet<>()).add(host.sub());
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

    /** The room that has {@code code} (canonical), if it is live. */
    synchronized Optional<RoomActor> findByCode(String code) {
        return Optional.ofNullable(codes.get(code)).map(rooms::get);
    }

    /** The tombstone of {@code code} (canonical), if a room with it closed less than 24 h ago. */
    synchronized Optional<Tombstone> tombstone(String code) {
        Tombstone tombstone = tombstones.get(code);
        return tombstone == null || !clock.instant().isBefore(tombstone.until()) ? Optional.empty() : Optional.of(tombstone);
    }

    /**
     * {@code player} (from {@code sessionId}) joins the room with {@code canonicalCode} (null when what she sent is no
     * code: a failed lookup like any other). In order: draining; already in this room (a repeat join, answered with
     * {@code ROOM_JOINED} again); busy elsewhere; the failed-lookup limit; the lookup (live, tombstone or nothing); then
     * her {@code sub} is claimed for the room and the actor gets the join.
     */
    synchronized Joining join(MinnalPrincipal player, String sessionId, String canonicalCode) {
        if (drain.isDraining()) {
            return new Joining.Draining();
        }
        String sub = player.sub();
        UUID roomId = canonicalCode == null ? null : codes.get(canonicalCode);
        Optional<Activity> held = participation.activityOf(sub);
        if (held.isPresent()) {
            if (roomId != null && held.get().equals(new Activity.InRoom(roomId))) {
                rooms.get(roomId).tell(new RoomEvent.Join(sub, sessionId, player.name()));
                return new Joining.Sent(roomId);
            }
            return new Joining.Busy(held.get());
        }
        Instant now = clock.instant();
        Deque<Instant> failures = failedLookups.get(sub);
        if (failures != null) {
            while (!failures.isEmpty() && !now.isBefore(failures.peekFirst().plus(LOOKUP_WINDOW))) {
                failures.pollFirst();
            }
            if (failures.isEmpty()) {
                failedLookups.remove(sub);
            } else if (failures.size() >= MAX_FAILED_LOOKUPS) {
                return new Joining.RateLimited();
            }
        }
        if (roomId == null) {
            failedLookups.computeIfAbsent(sub, s -> new ArrayDeque<>()).addLast(now);
            pruneLookups(now);
            Optional<Tombstone> tombstone = canonicalCode == null ? Optional.empty() : tombstone(canonicalCode);
            return tombstone.<Joining>map(t -> new Joining.Expired(t.reason())).orElseGet(Joining.NotFound::new);
        }
        Optional<Activity> raced = participation.claim(sub, new Activity.InRoom(roomId));
        if (raced.isPresent()) {
            return new Joining.Busy(raced.get());
        }
        claims.computeIfAbsent(roomId, id -> new HashSet<>()).add(sub);
        rooms.get(roomId).tell(new RoomEvent.Join(sub, sessionId, player.name()));
        return new Joining.Sent(roomId);
    }

    /** On the room's thread: {@code sub} left, or her join was refused; she is free at once. */
    private void released(RoomActor room, String sub) {
        synchronized (this) {
            Set<String> claimed = claims.get(room.roomId());
            if (claimed == null || !claimed.remove(sub)) {
                return;
            }
        }
        try {
            participation.release(sub, new Activity.InRoom(room.roomId()));
        } catch (RuntimeException e) {
            log.atError().addKeyValue("roomId", room.roomId()).setCause(e).log("could not release a room member");
        }
    }

    private void pruneTombstones(Instant now) {
        tombstones.values().removeIf(t -> !now.isBefore(t.until()));
    }

    /** Forgets every {@code sub} whose failures are all older than the window (bounds the map). */
    private void pruneLookups(Instant now) {
        if (failedLookups.size() < 1024) {
            return;
        }
        for (Iterator<Deque<Instant>> it = failedLookups.values().iterator(); it.hasNext(); ) {
            Deque<Instant> failures = it.next();
            if (failures.isEmpty() || !now.isBefore(failures.peekLast().plus(LOOKUP_WINDOW))) {
                it.remove();
            }
        }
    }

    /** How many rooms are live. */
    public synchronized int liveCount() {
        return rooms.size();
    }

    @Override
    public boolean isMember(UUID roomId, String sub) {
        return find(roomId).map(room -> room.isMember(sub)).orElse(false);
    }

    /**
     * On the room's own thread, as it closes: free the code (keeping its tombstone) and every {@code sub} claimed for
     * the room, members and joins still on its queue alike. The maps come first so nothing can leak.
     */
    private void closed(RoomActor room, RoomClosedReason reason) {
        Set<String> claimed;
        synchronized (this) {
            rooms.remove(room.roomId(), room);
            pruneTombstones(clock.instant());
            if (codes.remove(room.code(), room.roomId())) {
                tombstones.put(room.code(), new Tombstone(room.code(), reason, clock.instant().plus(TOMBSTONE_TTL)));
            }
            claimed = claims.remove(room.roomId());
            notifyAll();
        }
        metrics.closed();
        for (String sub : claimed == null ? Set.<String>of() : claimed) {
            try {
                participation.release(sub, new Activity.InRoom(room.roomId()));
            } catch (RuntimeException e) {
                log.atError().addKeyValue("roomId", room.roomId()).setCause(e).log("could not release a room member");
            }
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
            claims.clear();
        }
        open.forEach(RoomActor::close);
    }
}
