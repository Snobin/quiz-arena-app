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
 * {@code ROOM_LOBBY_UPDATED} on the room topic with the next {@code seq}) and {@code leave}; a lobby with other humans
 * is not built yet (Stories 5.3 and 5.5), so those cases answer {@code NOT_AVAILABLE_YET}. It closes when its host
 * leaves alone, when her reconnect grace runs out, at {@code expiresAt}, or when the service drains, and then reports
 * to its registry, which frees the code and the players.
 *
 * <p>Timers only {@code tell} events here. The room has no way to add a bot.
 */
final class RoomActor {

    private static final Logger log = LoggerFactory.getLogger(RoomActor.class);

    private final RoomState state;
    private final RoomSettings settings;
    private final Clock clock;
    private final RoomTimers timers;
    private final PlayerChannel channel;
    private final RoomBroadcaster broadcaster;
    private final Predicate<String> hasSession;
    private final BiConsumer<RoomActor, RoomClosedReason> onClosed;
    private final Actor<RoomEvent> actor;

    /** Other threads read it (subscription checks): replaced whole by the actor. */
    private volatile Set<String> members;

    private Future<?> expiryTimer;
    private Future<?> graceTimer;
    private long graceEpoch;
    private boolean closed;

    RoomActor(RoomState state, RoomSettings settings, Clock clock, RoomTimers timers, PlayerChannel channel,
            RoomBroadcaster broadcaster, Predicate<String> hasSession, BiConsumer<RoomActor, RoomClosedReason> onClosed) {
        this.state = state;
        this.settings = settings;
        this.clock = clock;
        this.timers = timers;
        this.channel = channel;
        this.broadcaster = broadcaster;
        this.hasSession = hasSession;
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
            case RoomEvent.Leave leave -> onLeave(leave);
            case RoomEvent.Disconnected disconnected -> onDisconnected(disconnected.sub());
            case RoomEvent.Reconnected reconnected -> onReconnected(reconnected.sub());
            case RoomEvent.Announce announce -> onAnnounce(announce);
            case RoomEvent.GraceExpired expired -> onGraceExpired(expired.epoch());
            case RoomEvent.Expire expire -> onExpire();
            case RoomEvent.Drain drain -> finish(RoomClosedReason.SERVER_DRAINING);
        }
    }

    private void onBegin() {
        armExpiry();
        channel.toPlayer(state.hostSub(), joinedFor(state.hostSub()));
    }

    private void armExpiry() {
        Duration left = Duration.between(clock.instant(), state.expiresAt());
        expiryTimer = timers.schedule(left, () -> actor.tell(new RoomEvent.Expire()));
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
        broadcaster.broadcast(roomId(), ServerMessage.roomBroadcast(MessageType.ROOM_LOBBY_UPDATED, roomId(),
                state.nextSeq(), clock.instant(), new RoomLobbyUpdatedPayload(state.view())));
    }

    private void onLeave(RoomEvent.Leave leave) {
        // A host with other humans, and a member who is not the host, wait for Stories 5.3 and 5.5.
        if (state.isHost(leave.sub()) && state.humanCount() == 1) {
            finish(RoomClosedReason.HOST_LEFT);
            return;
        }
        refuse(leave.sub(), leave.sessionId(), ErrorCode.NOT_AVAILABLE_YET);
    }

    /** The host's last session closed: she has the grace to come back. */
    private void onDisconnected(String sub) {
        if (!state.isHost(sub) || hasSession.test(sub)) {
            return; // a reconnect raced the disconnect
        }
        cancelGrace();
        long epoch = graceEpoch;
        graceTimer = timers.schedule(settings.grace(), () -> actor.tell(new RoomEvent.GraceExpired(epoch)));
        log.atInfo().addKeyValue("roomId", roomId()).log("the host disconnected; grace of {} armed", settings.grace());
    }

    private void onReconnected(String sub) {
        if (state.isHost(sub)) {
            cancelGrace();
        }
    }

    private void onAnnounce(RoomEvent.Announce announce) {
        if (state.isMember(announce.sub())) {
            channel.toSession(announce.sub(), announce.sessionId(), joinedFor(announce.sub()));
        }
    }

    private void onGraceExpired(long epoch) {
        if (epoch != graceEpoch || graceTimer == null) {
            return; // stale: she came back (or dropped again) since it was armed
        }
        graceTimer = null;
        if (hasSession.test(state.hostSub())) {
            return;
        }
        log.atInfo().addKeyValue("roomId", roomId()).log("the host's reconnect grace ran out");
        finish(RoomClosedReason.HOST_DISCONNECTED);
    }

    private void cancelGrace() {
        graceEpoch++;
        if (graceTimer != null) {
            graceTimer.cancel(false);
            graceTimer = null;
        }
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
        cancelGrace();
        if (expiryTimer != null) {
            expiryTimer.cancel(false);
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

    /** The humans of the room at the moment it closes (for the registry to release). */
    Set<String> memberSubsAtClose() {
        return Set.copyOf(state.memberSubs());
    }

    String hostSub() {
        return state.hostSub();
    }
}
