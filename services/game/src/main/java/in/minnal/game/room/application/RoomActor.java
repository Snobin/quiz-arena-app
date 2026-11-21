package in.minnal.game.room.application;

import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.RoomClosedPayload;
import in.minnal.contracts.realtime.RoomClosedReason;
import in.minnal.contracts.realtime.RoomJoinedPayload;
import in.minnal.contracts.realtime.RoomLobbyUpdatedPayload;
import in.minnal.contracts.realtime.RoomRole;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.platform.actor.Actor;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.RoomBroadcaster;
import in.minnal.game.room.domain.RoomConfigRules;
import in.minnal.game.room.domain.RoomPhase;
import in.minnal.game.room.domain.RoomState;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Future;
import java.util.function.BiConsumer;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * One Battle Room (AD-4): its {@link RoomState} lives on this actor's own thread, and every lobby change is an event on
 * its queue. In the lobby it answers a host's {@code configure} (validated as on create, then a
 * {@code ROOM_LOBBY_UPDATED} with the next {@code seq} at once), a join (Story 5.3: up to {@value RoomState#MAX_HUMANS}
 * humans, the host included), a member's leave, and a start (still the {@code NOT_AVAILABLE_YET} stub once the host and
 * player-count checks pass, until Story 5.4).
 *
 * <p>Joins and leaves are coalesced: the first one arms a {@value #COALESCE_MS} ms timer, and when it fires one
 * {@code ROOM_LOBBY_UPDATED {room, joined[], left[]}} goes out with the next {@code seq}; a configure in between flushes
 * them with it. Every member whose last session drops has the AD-11 grace to come back (keyed by {@code sub}); a
 * member's runs out by removing her, the host's by closing the room. The room also closes when its host leaves, at
 * {@code expiresAt}, or when the service drains, and then reports to its registry, which frees the code, keeps a
 * tombstone and frees the players.
 *
 * <p>Timers only {@code tell} events here. The room has no way to add a bot.
 */
final class RoomActor {

    private static final Logger log = LoggerFactory.getLogger(RoomActor.class);

    /** At most one membership broadcast per this window (Story 5.3). */
    static final long COALESCE_MS = 250;
    static final Duration COALESCE = Duration.ofMillis(COALESCE_MS);

    private final RoomState state;
    private final RoomSettings settings;
    private final Clock clock;
    private final RoomTimers timers;
    private final PlayerChannel channel;
    private final RoomBroadcaster broadcaster;
    private final Predicate<String> hasSession;
    private final BiConsumer<RoomActor, String> onRelease;
    private final BiConsumer<RoomActor, RoomClosedReason> onClosed;
    private final Actor<RoomEvent> actor;

    /** Other threads read it (subscription checks): replaced whole by the actor. */
    private volatile Set<String> members;

    private Future<?> expiryTimer;
    /** One armed grace per dropped member: its timer and the epoch it was armed with. */
    private final Map<String, Grace> graces = new HashMap<>();
    private long graceEpoch;
    private final LinkedHashSet<UUID> joined = new LinkedHashSet<>();
    private final LinkedHashSet<UUID> left = new LinkedHashSet<>();
    private Future<?> flushTimer;
    private boolean closed;

    private record Grace(long epoch, Future<?> timer) {
    }

    RoomActor(RoomState state, RoomSettings settings, Clock clock, RoomTimers timers, PlayerChannel channel,
            RoomBroadcaster broadcaster, Predicate<String> hasSession, BiConsumer<RoomActor, String> onRelease,
            BiConsumer<RoomActor, RoomClosedReason> onClosed) {
        this.state = state;
        this.settings = settings;
        this.clock = clock;
        this.timers = timers;
        this.channel = channel;
        this.broadcaster = broadcaster;
        this.hasSession = hasSession;
        this.onRelease = onRelease;
        this.onClosed = onClosed;
        this.members = Set.copyOf(state.memberSubs());
        // Last: the thread starts here and reads every field above.
        this.actor = new Actor<>("room-" + state.roomId(), this::handle);
    }

    UUID roomId() {
        return state.roomId();
    }

    String code() {
        return state.code();
    }

    /** The humans in the room (a snapshot, safe from any thread). */
    Set<String> members() {
        return members;
    }

    boolean isMember(String sub) {
        return members.contains(sub);
    }

    void tell(RoomEvent event) {
        actor.tell(event);
    }

    boolean onActorThread() {
        return actor.onActorThread();
    }

    void close() {
        actor.close();
    }

    private void handle(RoomEvent event) {
        if (closed) {
            return;
        }
        switch (event) {
            case RoomEvent.Begin begin -> onBegin();
            case RoomEvent.Configure configure -> onConfigure(configure);
            case RoomEvent.Join join -> onJoin(join);
            case RoomEvent.Start start -> onStart(start);
            case RoomEvent.Leave leave -> onLeave(leave);
            case RoomEvent.Disconnected disconnected -> onDisconnected(disconnected.sub());
            case RoomEvent.Reconnected reconnected -> cancelGrace(reconnected.sub());
            case RoomEvent.Announce announce -> onAnnounce(announce);
            case RoomEvent.GraceExpired expired -> onGraceExpired(expired.sub(), expired.epoch());
            case RoomEvent.Flush flush -> onFlush();
            case RoomEvent.Expire expire -> onExpire();
            case RoomEvent.Drain drain -> finish(RoomClosedReason.SERVER_DRAINING);
        }
    }

    private void onBegin() {
        armExpiry();
        channel.toPlayer(state.hostSub(), joinedFor(state.hostSub()));
    }

    private void armExpiry() {
        Duration timeLeft = Duration.between(clock.instant(), state.expiresAt());
        expiryTimer = timers.schedule(timeLeft, () -> actor.tell(new RoomEvent.Expire()));
    }

    private void onExpire() {
        if (clock.instant().isBefore(state.expiresAt())) {
            armExpiry(); // fired early (timer and wall clock disagree): wait out the rest
            return;
        }
        finish(RoomClosedReason.EXPIRED);
    }

    private void onConfigure(RoomEvent.Configure configure) {
        if (!state.isHost(configure.sub())) {
            refuse(configure.sub(), configure.sessionId(), ErrorCode.NOT_HOST);
            return;
        }
        if (state.phase() != RoomPhase.LOBBY) {
            refuse(configure.sub(), configure.sessionId(), ErrorCode.NOT_AVAILABLE_YET);
            return;
        }
        RoomConfigRules.Result result = RoomConfigRules.forConfigure(configure.input(), state.config());
        if (!result.valid()) {
            refuse(configure.sub(), configure.sessionId(), result.error());
            return;
        }
        state.configure(result.config());
        broadcastLobby(); // at once, carrying any joins and leaves still waiting in the window
    }

    private void onJoin(RoomEvent.Join join) {
        String sub = join.sub();
        if (state.isMember(sub)) {
            // Another tab, or a second tap on the link: the room as it stands, and no second participant.
            cancelGrace(sub);
            channel.toSession(sub, join.sessionId(), joinedFor(sub));
            return;
        }
        if (state.phase() != RoomPhase.LOBBY) {
            refuseJoin(join, ErrorCode.ROOM_STARTED);
            return;
        }
        if (state.isFull()) {
            refuseJoin(join, ErrorCode.ROOM_FULL);
            return;
        }
        String name = join.displayName() == null || join.displayName().isBlank() ? "Player" : join.displayName();
        UUID participantId = state.add(sub, name);
        members = Set.copyOf(state.memberSubs());
        joined.add(participantId);
        channel.toSession(sub, join.sessionId(), joinedFor(sub));
        armFlush();
        if (!hasSession.test(sub)) {
            armGrace(sub); // her session dropped while the join was queued: the drop was ignored then
        }
        log.atInfo().addKeyValue("roomId", roomId()).addKeyValue("userId", sub).log("joined the room");
    }

    /** A join the room cannot take: her claim on this room is handed back first, so she is free at once. */
    private void refuseJoin(RoomEvent.Join join, ErrorCode code) {
        onRelease.accept(this, join.sub());
        // No roomId: a refused joiner is not a member and learns nothing about the room.
        channel.toSession(join.sub(), join.sessionId(), ServerMessage.error(code, null, clock.instant()));
    }

    private void onStart(RoomEvent.Start start) {
        if (!state.isHost(start.sub())) {
            refuse(start.sub(), start.sessionId(), ErrorCode.NOT_HOST);
            return;
        }
        if (state.phase() == RoomPhase.LOBBY && state.humanCount() < 2) {
            refuse(start.sub(), start.sessionId(), ErrorCode.NOT_ENOUGH_PLAYERS);
            return;
        }
        // Story 5.4 builds the start itself.
        refuse(start.sub(), start.sessionId(), ErrorCode.NOT_AVAILABLE_YET);
    }

    private void onLeave(RoomEvent.Leave leave) {
        if (state.isHost(leave.sub())) {
            finish(RoomClosedReason.HOST_LEFT); // the client confirmed first when others were in the lobby
            return;
        }
        if (state.isMember(leave.sub())) {
            removeMember(leave.sub());
        }
        // Not a member: nothing to leave, ignored (as for a room that is gone).
    }

    /** A member who is not the host goes: out of the list, her {@code sub} free at once, and in the next broadcast. */
    private void removeMember(String sub) {
        cancelGrace(sub);
        UUID participantId = state.remove(sub);
        members = Set.copyOf(state.memberSubs());
        onRelease.accept(this, sub);
        if (participantId != null && !joined.remove(participantId)) {
            left.add(participantId); // one who joined and left inside the window is in neither list
        }
        armFlush();
        log.atInfo().addKeyValue("roomId", roomId()).addKeyValue("userId", sub).log("left the room");
    }

    /** A member's last session closed: she has the grace to come back, and stays listed meanwhile. */
    private void onDisconnected(String sub) {
        if (!state.isMember(sub) || hasSession.test(sub)) {
            return; // a reconnect raced the disconnect
        }
        armGrace(sub);
    }

    private void armGrace(String sub) {
        cancelGrace(sub);
        long epoch = ++graceEpoch;
        Future<?> timer = timers.schedule(settings.grace(), () -> actor.tell(new RoomEvent.GraceExpired(sub, epoch)));
        graces.put(sub, new Grace(epoch, timer));
        log.atInfo().addKeyValue("roomId", roomId()).addKeyValue("userId", sub)
                .log("{} disconnected; grace of {} armed", state.isHost(sub) ? "the host" : "a member", settings.grace());
    }

    private void onAnnounce(RoomEvent.Announce announce) {
        if (state.isMember(announce.sub())) {
            channel.toSession(announce.sub(), announce.sessionId(), joinedFor(announce.sub()));
        }
    }

    private void onGraceExpired(String sub, long epoch) {
        Grace grace = graces.get(sub);
        if (grace == null || grace.epoch() != epoch) {
            return; // stale: she came back (or dropped again) since it was armed
        }
        graces.remove(sub);
        if (hasSession.test(sub) || !state.isMember(sub)) {
            return;
        }
        if (state.isHost(sub)) {
            log.atInfo().addKeyValue("roomId", roomId()).log("the host's reconnect grace ran out");
            finish(RoomClosedReason.HOST_DISCONNECTED);
            return;
        }
        removeMember(sub);
    }

    private void cancelGrace(String sub) {
        Grace grace = graces.remove(sub);
        if (grace != null) {
            grace.timer().cancel(false);
        }
    }

    private void armFlush() {
        if (flushTimer == null) {
            flushTimer = timers.schedule(COALESCE, () -> actor.tell(new RoomEvent.Flush()));
        }
    }

    private void onFlush() {
        flushTimer = null;
        if (!joined.isEmpty() || !left.isEmpty()) {
            broadcastLobby();
        }
    }

    /** One {@code ROOM_LOBBY_UPDATED} with the next {@code seq}: the whole lobby and what came and went since the last. */
    private void broadcastLobby() {
        if (flushTimer != null) {
            flushTimer.cancel(false);
            flushTimer = null;
        }
        List<UUID> came = new ArrayList<>(joined);
        List<UUID> went = new ArrayList<>(left);
        joined.clear();
        left.clear();
        broadcaster.broadcast(roomId(), ServerMessage.roomBroadcast(MessageType.ROOM_LOBBY_UPDATED, roomId(),
                state.nextSeq(), clock.instant(), new RoomLobbyUpdatedPayload(state.view(), came, went)));
    }

    private ServerMessage<RoomJoinedPayload> joinedFor(String sub) {
        RoomRole role = state.isHost(sub) ? RoomRole.HOST : RoomRole.MEMBER;
        return ServerMessage.roomReply(MessageType.ROOM_JOINED, roomId(), state.seq(), clock.instant(),
                new RoomJoinedPayload(roomId(), state.code(), role, state.participantIdOf(sub), state.view()));
    }

    private void refuse(String sub, String sessionId, ErrorCode code) {
        channel.toSession(sub, sessionId, ServerMessage.roomError(code, roomId(), clock.instant()));
    }

    /** Closes the room: tells every member, then hands the code and the players back to the registry. */
    private void finish(RoomClosedReason reason) {
        closed = true;
        state.end();
        List.copyOf(graces.keySet()).forEach(this::cancelGrace);
        if (expiryTimer != null) {
            expiryTimer.cancel(false);
        }
        if (flushTimer != null) {
            flushTimer.cancel(false);
            flushTimer = null;
        }
        Instant now = clock.instant();
        try {
            broadcaster.broadcast(roomId(), ServerMessage.roomBroadcast(MessageType.ROOM_CLOSED, roomId(),
                    state.nextSeq(), now, new RoomClosedPayload(reason)));
            // Also private, so a member who has not subscribed to the topic yet still learns it.
            for (String sub : state.memberSubs()) {
                channel.toPlayer(sub, ServerMessage.aboutRoom(MessageType.ROOM_CLOSED, roomId(), now, new RoomClosedPayload(reason)));
            }
        } catch (RuntimeException e) {
            log.atWarn().addKeyValue("roomId", roomId()).setCause(e).log("could not tell the members the room closed");
        } finally {
            members = Set.of();
            onClosed.accept(this, reason);
            actor.close();
        }
    }

    String hostSub() {
        return state.hostSub();
    }
}
