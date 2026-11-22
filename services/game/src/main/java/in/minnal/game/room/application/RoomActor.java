package in.minnal.game.room.application;

import in.minnal.contracts.internal.QuestionSetFilters;
import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.internal.QuestionSetTopic;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.MatchEndedRoom;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.RoomLobbyPhase;
import in.minnal.contracts.realtime.RoomMatchStartedPayload;
import in.minnal.contracts.realtime.RoomStartFailedPayload;
import in.minnal.contracts.realtime.RoomStartFailedReason;
import in.minnal.contracts.realtime.TopicInfo;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.matchmaking.application.QuestionSetClient;
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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Future;
import java.util.function.BiConsumer;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * One Battle Room (AD-4): its {@link RoomState} lives on this actor's own thread, and every lobby change is an event on
 * its queue. In the lobby it answers a host's {@code configure} (validated as on create, then a
 * {@code ROOM_LOBBY_UPDATED} with the next {@code seq} at once), a join (Story 5.3: up to {@value RoomState#MAX_HUMANS}
 * humans, the host included), a member's leave, and a start.
 *
 * <p>Start (Story 5.4): the host's start, with at least 2 humans and the service not draining, moves the room to
 * {@code STARTING} (a step of the lobby: {@code ROOM_LOBBY_UPDATED {phase: STARTING}}) and fetches the question set off
 * this thread; the result comes back as a {@link RoomEvent.StartFetched}. A failure returns the room to {@code LOBBY}
 * with {@code ROOM_START_FAILED}; a success with the host and 2 humans still here starts the match actor (a fresh
 * {@code matchId}, every human a {@code USER}, no bot) and broadcasts {@code ROOM_MATCH_STARTED}. From then on the
 * match runs the show; the room only waits for it to end, then ends itself (its code expires at once). A running room
 * match is not cut short by the 24 h expiry or by a drain.
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
    /** A 3 s countdown plus a 0.5 s subscription buffer (Story 5.4). */
    static final Duration FIRST_QUESTION_DELAY = Duration.ofMillis(3500);
    static final String CATEGORY = "KERALA_PSC";

    private final RoomState state;
    private final RoomSettings settings;
    private final Clock clock;
    private final RoomTimers timers;
    private final PlayerChannel channel;
    private final RoomBroadcaster broadcaster;
    private final Predicate<String> hasSession;
    private final BiConsumer<RoomActor, String> onRelease;
    private final BiConsumer<RoomActor, RoomClosedReason> onClosed;
    private final QuestionSetClient questions;
    private final MatchRegistry matches;
    private final RoomMetrics metrics;
    private final BooleanSupplier draining;
    private final Actor<RoomEvent> actor;

    /** Other threads read it (subscription checks): replaced whole by the actor. */
    private volatile Set<String> members;
    /** Whether the match runs (read by the registry while draining). */
    private volatile boolean inMatch;

    private Future<?> expiryTimer;
    /** One armed grace per dropped member: its timer and the epoch it was armed with. */
    private final Map<String, Grace> graces = new HashMap<>();
    private long graceEpoch;
    private final LinkedHashSet<UUID> joined = new LinkedHashSet<>();
    private final LinkedHashSet<UUID> left = new LinkedHashSet<>();
    private Future<?> flushTimer;
    private boolean closed;
    private Succession succession;

    private record Grace(long epoch, Future<?> timer) {
    }

    RoomActor(RoomState state, RoomSettings settings, Clock clock, RoomTimers timers, PlayerChannel channel,
            RoomBroadcaster broadcaster, Predicate<String> hasSession, BiConsumer<RoomActor, String> onRelease,
            BiConsumer<RoomActor, RoomClosedReason> onClosed, QuestionSetClient questions, MatchRegistry matches,
            RoomMetrics metrics, BooleanSupplier draining) {
        this.questions = questions;
        this.matches = matches;
        this.metrics = metrics;
        this.draining = draining;
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

    /** Whether the room's match is running: a drain lets such a room play on. */
    boolean inMatch() {
        return inMatch;
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
            case RoomEvent.Drain drain -> onDrain();
            case RoomEvent.StartFetched fetched -> onStartFetched(fetched);
            case RoomEvent.MatchEnded ended -> onMatchEnded(ended);
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
        if (state.phase() == RoomPhase.IN_MATCH) {
            return; // not cut short: the room ends when its match does
        }
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
        if (state.phase() != RoomPhase.LOBBY) {
            return; // already starting or playing: a repeat start changes nothing
        }
        if (state.humanCount() < 2) {
            refuse(start.sub(), start.sessionId(), ErrorCode.NOT_ENOUGH_PLAYERS);
            return;
        }
        if (draining.getAsBoolean()) {
            refuse(start.sub(), start.sessionId(), ErrorCode.SERVER_DRAINING);
            return;
        }
        state.starting();
        broadcastLobby(); // {phase: STARTING}, carrying any joins and leaves still waiting in the window
        fetchSet();
    }

    /** Asks core for the set, off this thread; the answer comes back as an event (a failure to ask is one too). */
    private void fetchSet() {
        RoomConfigRules.Config config = state.config();
        // A custom topic is the host's own: core checks she owns it and that it still has enough questions (Story 6.5a).
        QuestionSetRequest request = config.source().type() == QuestionSource.CUSTOM
                ? new QuestionSetRequest(QuestionSource.CUSTOM, null, config.source().customTopicId(), config.questionCount(),
                        state.hostSub())
                : new QuestionSetRequest(QuestionSource.BANK,
                        new QuestionSetFilters(CATEGORY, null, config.source().topicId(), null), null, config.questionCount(),
                        state.hostSub());
        CompletableFuture<QuestionSetResponse> fetch;
        try {
            fetch = questions.fetch(request);
        } catch (RuntimeException e) {
            actor.tell(new RoomEvent.StartFetched(null, e));
            return;
        }
        fetch.whenComplete((set, failure) -> actor.tell(new RoomEvent.StartFetched(set, failure)));
    }

    private void onStartFetched(RoomEvent.StartFetched fetched) {
        if (state.phase() != RoomPhase.STARTING) {
            return;
        }
        QuestionSetResponse set = fetched.set();
        int count = state.config().questionCount();
        boolean custom = state.config().source().type() == QuestionSource.CUSTOM;
        if (fetched.failure() != null || set == null || set.questions().size() != count
                || (custom ? set.customTopic() == null : set.topic() == null)) {
            Throwable cause = fetched.failure() instanceof CompletionException && fetched.failure().getCause() != null
                    ? fetched.failure().getCause() : fetched.failure();
            // A short set is a topic with too few questions, like core's own 422.
            boolean sourceGone = cause instanceof QuestionSetClient.SourceUnavailableException;
            boolean topicGone = cause instanceof QuestionSetClient.TopicUnavailableException
                    || (cause == null && set != null && set.questions().size() < count);
            log.atWarn().addKeyValue("roomId", roomId())
                    .log("question set unavailable, room start failed: {}", cause == null ? "short or empty set"
                            : cause.getClass().getSimpleName());
            state.backToLobby();
            broadcaster.broadcast(roomId(), ServerMessage.roomBroadcast(MessageType.ROOM_START_FAILED, roomId(),
                    state.nextSeq(), clock.instant(), new RoomStartFailedPayload(sourceGone
                            ? RoomStartFailedReason.SOURCE_UNAVAILABLE : topicGone
                            ? RoomStartFailedReason.TOPIC_UNAVAILABLE : RoomStartFailedReason.UNAVAILABLE)));
            return;
        }
        if (state.humanCount() < 2) {
            state.backToLobby(); // players left meanwhile: the "Waiting for 1 more player" lobby (the host cannot be gone)
            broadcastLobby();
            return;
        }
        startMatch(set);
    }

    private void startMatch(QuestionSetResponse set) {
        Instant now = clock.instant();
        UUID matchId = UUID.randomUUID();
        boolean custom = state.config().source().type() == QuestionSource.CUSTOM;
        QuestionSource questionSource = custom ? QuestionSource.CUSTOM : QuestionSource.BANK;
        QuestionSetTopic topic = set.topic();
        // A custom topic has a name only: core's current one, not the one the host's client sent to the lobby.
        TopicInfo topicInfo = custom ? new TopicInfo(null, set.customTopic().name(), null)
                : new TopicInfo(topic.topicId(), topic.name(), topic.subjectName());
        List<in.minnal.contracts.realtime.Participant> participants = state.participants();
        Instant firstQuestionAt = now.plus(FIRST_QUESTION_DELAY);
        MatchSetup setup = new MatchSetup(matchId, MatchMode.BATTLE_ROOM, participants, state.humans(), set.questions(),
                Map.of(), Map.of(), now, questionSource, topicInfo,
                new MatchEndedRoom(roomId(), state.humans().get(state.hostSub())));
        if (matches.start(setup, firstQuestionAt, match -> actor.tell(new RoomEvent.MatchEnded(matchId))).isEmpty()) {
            log.atWarn().addKeyValue("roomId", roomId()).log("match not started: draining");
            finish(RoomClosedReason.SERVER_DRAINING);
            return;
        }
        state.inMatch();
        inMatch = true;
        joined.clear();
        left.clear();
        if (flushTimer != null) {
            flushTimer.cancel(false);
            flushTimer = null;
        }
        // The match owns each player's connection from here on (Story 1.9); the 24 h expiry waits for its end.
        List.copyOf(graces.keySet()).forEach(this::cancelGrace);
        metrics.started(participants.size());
        log.atInfo().addKeyValue("roomId", roomId()).addKeyValue("matchId", matchId)
                .addKeyValue("userId", state.hostSub()).log("room match started with {} humans", participants.size());
        broadcaster.broadcast(roomId(), ServerMessage.roomBroadcast(MessageType.ROOM_MATCH_STARTED, roomId(),
                state.nextSeq(), now, new RoomMatchStartedPayload(roomId(), matchId, MatchMode.BATTLE_ROOM,
                        participants, state.config().questionCount(), topicInfo, firstQuestionAt, questionSource)));
    }

    private void onMatchEnded(RoomEvent.MatchEnded ended) {
        // Kept for the registry, which reads it as the room closes (on this thread) to remember the match for play again.
        succession = new Succession(ended.matchId(), state.hostSub(), state.participants().get(0).displayName(),
                state.config().source(), state.config().questionCount(), Set.copyOf(state.memberSubs()));
        finish(RoomClosedReason.MATCH_ENDED, false);
    }

    /** What play again (Story 5.6) needs of a finished room match; the registry keeps it for 60 s. */
    record Succession(UUID matchId, String hostSub, String hostName, in.minnal.contracts.realtime.RoomSource source,
            int questionCount, Set<String> participants) {
    }

    /** The finished match's succession data; read by the registry from {@code onClosed}, on this actor's thread. */
    Succession succession() {
        return succession;
    }

    /** A lobby (or a start in progress) closes with the service; a room whose match runs plays on. */
    private void onDrain() {
        if (state.phase() == RoomPhase.IN_MATCH) {
            return;
        }
        finish(RoomClosedReason.SERVER_DRAINING);
    }

    private void onLeave(RoomEvent.Leave leave) {
        if (state.phase() == RoomPhase.IN_MATCH) {
            return; // in a match a player leaves through the match (Story 1.9)
        }
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
        if (state.phase() == RoomPhase.IN_MATCH || !state.isMember(sub) || hasSession.test(sub)) {
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
        if (state.phase() == RoomPhase.IN_MATCH || hasSession.test(sub) || !state.isMember(sub)) {
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
                state.nextSeq(), clock.instant(), new RoomLobbyUpdatedPayload(state.view(), came, went,
                        state.phase() == RoomPhase.STARTING ? RoomLobbyPhase.STARTING : RoomLobbyPhase.LOBBY)));
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
        finish(reason, true);
    }

    /**
     * As above; {@code tellMembers} is false when the match ended: the players are in the match and learn of its end there
     * (Story 5.4), so no {@code ROOM_CLOSED} goes out.
     */
    private void finish(RoomClosedReason reason, boolean tellMembers) {
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
            if (!tellMembers) {
                return;
            }
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
