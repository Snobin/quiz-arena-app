package in.minnal.game.room.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.identity.Role;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ErrorPayload;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.RoomClosedReason;
import in.minnal.contracts.realtime.RoomJoinedPayload;
import in.minnal.contracts.realtime.RoomLobbyUpdatedPayload;
import in.minnal.contracts.realtime.RoomRole;
import in.minnal.contracts.realtime.RoomSource;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.PlayerSessions;
import in.minnal.game.room.domain.RoomCodes;
import in.minnal.game.room.domain.RoomConfigRules;
import in.minnal.game.support.ManualRoomTimers;
import in.minnal.game.support.MutableClock;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.random.RandomGenerator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** The registry without a socket: its code registry, the cap, the claim and what closing frees. */
class RoomRegistryTest {

    /** Alphabet indexes drawn from a script (six per code), then zeros. */
    static final class Scripted implements RandomGenerator {

        private final int[] script;
        private int next;

        Scripted(int... script) {
            this.script = script;
        }

        @Override
        public int nextInt(int bound) {
            return next < script.length ? script[next++] : 0;
        }

        @Override
        public long nextLong() {
            throw new UnsupportedOperationException();
        }
    }

    record Sent(String sub, ServerMessage<?> message) {
    }

    final List<Sent> sent = new CopyOnWriteArrayList<>();
    final List<ServerMessage<?>> broadcasts = new CopyOnWriteArrayList<>();
    final PlayerChannel channel = new PlayerChannel() {
        @Override
        public void toPlayer(String sub, ServerMessage<?> message) {
            sent.add(new Sent(sub, message));
        }

        @Override
        public void toSession(String sub, String sessionId, ServerMessage<?> message) {
            sent.add(new Sent(sub, message));
        }
    };
    final MutableClock clock = new MutableClock(Instant.parse("2026-11-21T10:00:00Z"));
    final ManualRoomTimers timers = new ManualRoomTimers();
    ParticipationRegistry participation = new ParticipationRegistry();
    final PlayerSessions sessions = new PlayerSessions(event -> { });
    final DrainState drain = new DrainState();
    final RoomConfigRules.Config config =
            new RoomConfigRules.Config(new RoomSource(QuestionSource.BANK, UUID.randomUUID()), 10);

    RoomRegistry registry;

    RoomRegistry registry(int maxLive, int... script) {
        registry = new RoomRegistry(drain, participation, sessions, channel, (roomId, message) -> broadcasts.add(message), clock,
                timers, new RoomSettings(Duration.ofHours(24), Duration.ofSeconds(10), maxLive),
                new RoomCodes(new Scripted(script)), new SimpleMeterRegistry());
        return registry;
    }

    @AfterEach
    void stop() {
        if (registry != null) {
            registry.destroy();
        }
    }

    static MinnalPrincipal host(String sub) {
        return new MinnalPrincipal(sub, Set.of(Role.USER), "Rajeev", "ml", true);
    }

    static RoomRegistry.Opening.Opened opened(RoomRegistry.Opening opening) {
        assertThat(opening).isInstanceOf(RoomRegistry.Opening.Opened.class);
        return (RoomRegistry.Opening.Opened) opening;
    }

    @Test
    void aSeededRandomThatRepeatsALiveCodeIsRedrawnSoNoTwoLiveRoomsShareACode() {
        // First room: AAAAAA. Second room: AAAAAA again (taken, redrawn), then BBBBBB.
        registry(10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);

        UUID first = opened(registry.open(host("a"), config)).roomId();
        UUID second = opened(registry.open(host("b"), config)).roomId();

        assertThat(registry.find(first).orElseThrow().code()).isEqualTo("AAAAAA");
        assertThat(registry.find(second).orElseThrow().code()).isEqualTo("BBBBBB");
        assertThat(registry.findByCode("AAAAAA")).hasValueSatisfying(room -> assertThat(room.roomId()).isEqualTo(first));
        assertThat(registry.liveCount()).isEqualTo(2);
    }

    @Test
    void aClosedRoomFreesItsCodeItsHostAndTheGauge() {
        // AAAAAA, then AAAAAA again (tombstoned: redrawn), then BBBBBB.
        registry(10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);
        UUID first = opened(registry.open(host("a"), config)).roomId();
        assertThat(participation.activityOf("a")).contains(new Activity.InRoom(first));

        registry.find(first).orElseThrow().tell(new RoomEvent.Leave("a", "s1"));
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.liveCount() == 0);

        assertThat(participation.activityOf("a")).isEmpty();
        assertThat(registry.findByCode("AAAAAA")).isEmpty();
        assertThat(registry.isMember(first, "a")).isFalse();
        // Story 5.3: the code is tombstoned, so it is not drawn again while the tombstone lives.
        assertThat(registry.tombstone("AAAAAA")).hasValueSatisfying(t -> assertThat(t.reason()).isEqualTo(RoomClosedReason.HOST_LEFT));
        UUID second = opened(registry.open(host("b"), config)).roomId();
        assertThat(registry.find(second).orElseThrow().code()).isEqualTo("BBBBBB");
        assertThat(second).isNotEqualTo(first);
    }

    @Test
    void aBusySubIsRefusedAndTheCapAndDrainingBlockNewRooms() {
        registry(1);
        UUID first = opened(registry.open(host("a"), config)).roomId();

        assertThat(registry.open(host("a"), config)).isEqualTo(new RoomRegistry.Opening.Full()); // the cap first
        registry.destroy();

        registry(2);
        UUID room = opened(registry.open(host("x"), config)).roomId();
        assertThat(registry.open(host("x"), config)).isEqualTo(new RoomRegistry.Opening.Busy(new Activity.InRoom(room)));
        participation.claim("b", new Activity.InMatch(first));
        assertThat(registry.open(host("b"), config)).isEqualTo(new RoomRegistry.Opening.Busy(new Activity.InMatch(first)));
        assertThat(registry.liveCount()).isEqualTo(1);
        assertThat(first).isNotEqualTo(room);

        drain.begin();
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.liveCount() == 0);
        assertThat(registry.open(host("c"), config)).isEqualTo(new RoomRegistry.Opening.Draining());
        assertThat(participation.activityOf("x")).isEmpty();
        assertThat(sent).anyMatch(s -> s.sub().equals("x") && s.message().type() == MessageType.ROOM_CLOSED);
        assertThat(broadcasts).anyMatch(m -> m.type() == MessageType.ROOM_CLOSED
                && ((in.minnal.contracts.realtime.RoomClosedPayload) m.payload()).reason() == RoomClosedReason.SERVER_DRAINING);
    }

    @Test
    void aReleaseThatThrowsStillFreesTheRoomAndItsCode() {
        // AAAAAA, then AAAAAA again (tombstoned: redrawn), then BBBBBB.
        participation = new ParticipationRegistry() {
            @Override
            public boolean release(String sub, Activity expected) {
                throw new IllegalStateException("release failed");
            }
        };
        registry(10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1);
        UUID first = opened(registry.open(host("a"), config)).roomId();

        registry.find(first).orElseThrow().tell(new RoomEvent.Leave("a", "s1"));
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.liveCount() == 0);

        assertThat(registry.findByCode("AAAAAA")).isEmpty();
        assertThat(registry.find(first)).isEmpty();
        // A new room opens (another sub: the failed release left "a" claimed).
        UUID second = opened(registry.open(host("b"), config)).roomId();
        assertThat(registry.find(second).orElseThrow().code()).isEqualTo("BBBBBB");
    }

    @Test
    void aRoomHoldsOnlyHumansAndTheHostIsNeverItsOwnSub() {
        registry(10);
        UUID id = opened(registry.open(host("a"), config)).roomId();
        await().atMost(Duration.ofSeconds(5)).until(() -> sent.stream().anyMatch(s -> s.message().type() == MessageType.ROOM_JOINED));
        var joined = (in.minnal.contracts.realtime.RoomJoinedPayload) sent.get(0).message().payload();
        assertThat(joined.room().participants()).hasSize(1)
                .allSatisfy(p -> assertThat(p.kind()).isEqualTo(in.minnal.contracts.realtime.ParticipantKind.USER));
        assertThat(joined.room().hostParticipantId()).isNotEqualTo(UUID.nameUUIDFromBytes("a".getBytes()));
        assertThat(joined.roomId()).isEqualTo(id);
    }

    // ---- Story 5.3: join, tombstones, the failed-lookup limit, the cap and the coalesced broadcast ----

    static MinnalPrincipal player(String sub) {
        return new MinnalPrincipal(sub, Set.of(Role.USER), "Player " + sub, "ml", true);
    }

    List<RoomLobbyUpdatedPayload> lobbyUpdates() {
        return broadcasts.stream().filter(m -> m.type() == MessageType.ROOM_LOBBY_UPDATED)
                .map(m -> (RoomLobbyUpdatedPayload) m.payload()).toList();
    }

    List<ServerMessage<?>> sentTo(String sub, MessageType type) {
        return sent.stream().filter(s -> s.sub().equals(sub) && s.message().type() == type).<ServerMessage<?>>map(Sent::message).toList();
    }

    ErrorCode errorOf(String sub) {
        await().atMost(Duration.ofSeconds(5)).until(() -> !sentTo(sub, MessageType.ERROR).isEmpty());
        return ((ErrorPayload) sentTo(sub, MessageType.ERROR).getLast().payload()).code();
    }

    /** Fires the 250 ms coalescing timers until the room's queue has drained into a broadcast. */
    void flush(int expectedUpdates) {
        await().atMost(Duration.ofSeconds(5)).until(() -> {
            timers.fire(d -> d.equals(Duration.ofMillis(250)));
            return lobbyUpdates().size() >= expectedUpdates;
        });
    }

    @Test
    void aJoinAddsAMemberAndTheChangeIsBroadcastOnceTheWindowCloses() {
        registry(10, 0, 0, 0, 0, 0, 0);
        UUID id = opened(registry.open(host("h"), config)).roomId();

        assertThat(registry.join(player("p"), "s", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.Sent(id));
        await().atMost(Duration.ofSeconds(5)).until(() -> !sentTo("p", MessageType.ROOM_JOINED).isEmpty());
        var joined = (RoomJoinedPayload) sentTo("p", MessageType.ROOM_JOINED).getFirst().payload();
        assertThat(joined.role()).isEqualTo(RoomRole.MEMBER);
        assertThat(joined.room().humanCount()).isEqualTo(2);
        assertThat(joined.room().participants().get(1).displayName()).isEqualTo("Player p");
        assertThat(participation.activityOf("p")).contains(new Activity.InRoom(id));
        assertThat(registry.isMember(id, "p")).isTrue();
        assertThat(lobbyUpdates()).isEmpty(); // coalesced: nothing until the window closes
        assertThat(timers.pending()).anyMatch(t -> t.delay().equals(Duration.ofMillis(250)));

        flush(1);
        RoomLobbyUpdatedPayload update = lobbyUpdates().getFirst();
        assertThat(update.joined()).containsExactly(joined.selfParticipantId());
        assertThat(update.left()).isEmpty();
        assertThat(update.room().humanCount()).isEqualTo(2);

        // A repeat join (another tab) answers ROOM_JOINED again and adds no one.
        assertThat(registry.join(player("p"), "s2", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.Sent(id));
        await().atMost(Duration.ofSeconds(5)).until(() -> sentTo("p", MessageType.ROOM_JOINED).size() == 2);
        assertThat(((RoomJoinedPayload) sentTo("p", MessageType.ROOM_JOINED).getLast().payload()).room().humanCount()).isEqualTo(2);
        assertThat(timers.pending()).noneMatch(t -> t.delay().equals(Duration.ofMillis(250)));

        // She leaves: free at once, and the next broadcast lists her as left.
        registry.find(id).orElseThrow().tell(new RoomEvent.Leave("p", "s"));
        await().atMost(Duration.ofSeconds(5)).until(() -> participation.activityOf("p").isEmpty());
        flush(2);
        assertThat(lobbyUpdates().get(1).left()).containsExactly(joined.selfParticipantId());
        assertThat(lobbyUpdates().get(1).room().humanCount()).isEqualTo(1);
        assertThat(registry.isMember(id, "p")).isFalse();
    }

    @Test
    void aBusyJoinerIsRefusedAndAClosedRoomLeavesATombstoneFor24Hours() {
        registry(10, 0, 0, 0, 0, 0, 0);
        UUID id = opened(registry.open(host("h"), config)).roomId();
        participation.claim("busy", new Activity.InMatch(id));
        assertThat(registry.join(player("busy"), "s", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.Busy(new Activity.InMatch(id)));
        assertThat(registry.join(player("x"), "s", "BBBBBB")).isEqualTo(new RoomRegistry.Joining.NotFound());

        registry.find(id).orElseThrow().tell(new RoomEvent.Leave("h", "s"));
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.liveCount() == 0);
        assertThat(registry.join(player("y"), "s", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.Expired(RoomClosedReason.HOST_LEFT));
        assertThat(participation.activityOf("y")).isEmpty();

        clock.advance(Duration.ofHours(24));
        assertThat(registry.join(player("z"), "s", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.NotFound());
        assertThat(registry.tombstone("AAAAAA")).isEmpty();
    }

    @Test
    void tenFailedLookupsInAMinuteRateLimitTheRestOfThatMinuteAndSuccessesNeverCount() {
        registry(10, 0, 0, 0, 0, 0, 0);
        UUID id = opened(registry.open(host("h"), config)).roomId();
        for (int i = 0; i < 9; i++) {
            assertThat(registry.join(player("g"), "s", i % 2 == 0 ? "BBBBBB" : null)).isEqualTo(new RoomRegistry.Joining.NotFound());
            clock.advance(Duration.ofSeconds(1));
        }
        // A success in between never counts (and she leaves again).
        assertThat(registry.join(player("g"), "s", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.Sent(id));
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.isMember(id, "g"));
        registry.find(id).orElseThrow().tell(new RoomEvent.Leave("g", "s"));
        await().atMost(Duration.ofSeconds(5)).until(() -> participation.activityOf("g").isEmpty());

        assertThat(registry.join(player("g"), "s", "CCCCCC")).isEqualTo(new RoomRegistry.Joining.NotFound()); // the 10th
        assertThat(registry.join(player("g"), "s", "CCCCCC")).isEqualTo(new RoomRegistry.Joining.RateLimited());
        // Even a real code is refused until the minute is over; another sub is not affected.
        assertThat(registry.join(player("g"), "s", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.RateLimited());
        assertThat(registry.join(player("other"), "s", "CCCCCC")).isEqualTo(new RoomRegistry.Joining.NotFound());

        // The oldest failure is a minute old: one more try is allowed.
        clock.advance(Duration.ofSeconds(51));
        assertThat(registry.join(player("g"), "s", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.Sent(id));
    }

    @Test
    void sixtyNearSimultaneousJoinsLeaveExactlyFiftyAndEverySeqIsContiguous() throws Exception {
        registry(10, 0, 0, 0, 0, 0, 0);
        UUID id = opened(registry.open(host("h"), config)).roomId();
        int joiners = 60;
        CountDownLatch go = new CountDownLatch(1);
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < joiners; i++) {
            String sub = "j" + i;
            threads.add(Thread.ofPlatform().start(() -> {
                try {
                    go.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                registry.join(player(sub), "s", "AAAAAA");
            }));
        }
        // Fire the coalescing windows while the joins land, so several broadcasts go out.
        Thread flusher = Thread.ofPlatform().start(() -> {
            for (int i = 0; i < 200; i++) {
                timers.fire(d -> d.equals(Duration.ofMillis(250)));
                Thread.onSpinWait();
            }
        });
        go.countDown();
        for (Thread t : threads) {
            t.join();
        }
        flusher.join();
        await().atMost(Duration.ofSeconds(10)).until(() -> sent.stream()
                .filter(s -> s.sub().startsWith("j") && (s.message().type() == MessageType.ROOM_JOINED || s.message().type() == MessageType.ERROR))
                .count() == joiners);
        await().atMost(Duration.ofSeconds(5)).until(() -> {
            timers.fire(d -> d.equals(Duration.ofMillis(250)));
            return !lobbyUpdates().isEmpty() && lobbyUpdates().getLast().room().humanCount() == 50;
        });

        long full = sent.stream().filter(s -> s.message().type() == MessageType.ERROR
                && ((ErrorPayload) s.message().payload()).code() == ErrorCode.ROOM_FULL).count();
        assertThat(full).isEqualTo(11); // 60 joins + the host = 61 humans for 50 places
        assertThat(registry.find(id).orElseThrow().members()).hasSize(50);
        long inRoom = java.util.stream.IntStream.range(0, joiners)
                .filter(i -> participation.activityOf("j" + i).isPresent()).count();
        assertThat(inRoom).isEqualTo(49); // the host makes 50; the refused eleven are free
        List<Long> seqs = broadcasts.stream().map(ServerMessage::seq).toList();
        for (int i = 0; i < seqs.size(); i++) {
            assertThat(seqs.get(i)).isEqualTo(i + 1L);
        }
        assertThat(lobbyUpdates().stream().mapToInt(u -> u.joined().size()).sum()).isEqualTo(49);
        // A 51st (once the burst is over) gets ROOM_FULL too.
        assertThat(registry.join(player("late"), "s", "AAAAAA")).isEqualTo(new RoomRegistry.Joining.Sent(id));
        assertThat(errorOf("late")).isEqualTo(ErrorCode.ROOM_FULL);
        await().atMost(Duration.ofSeconds(5)).until(() -> participation.activityOf("late").isEmpty());
    }

    @Test
    void aJoinStillQueuedWhenTheRoomClosesIsReleasedWithTheMembers() {
        registry(10, 0, 0, 0, 0, 0, 0);
        UUID id = opened(registry.open(host("h"), config)).roomId();
        RoomActor room = registry.find(id).orElseThrow();
        // The host's leave is queued first; the join lands behind it and is dropped when the actor stops.
        room.tell(new RoomEvent.Leave("h", "s"));
        registry.join(player("p"), "s", "AAAAAA");
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.liveCount() == 0);
        await().atMost(Duration.ofSeconds(5)).until(() -> participation.activityOf("p").isEmpty());
    }

    @Test
    void aDroppedMemberStaysForTheGraceThenIsRemoved() {
        registry(10, 0, 0, 0, 0, 0, 0);
        UUID id = opened(registry.open(host("h"), config)).roomId();
        registry.join(player("p"), "s", "AAAAAA");
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.isMember(id, "p"));
        flush(1);
        RoomActor room = registry.find(id).orElseThrow();

        room.tell(new RoomEvent.Disconnected("p"));
        await().atMost(Duration.ofSeconds(5)).until(() -> timers.pending().stream().anyMatch(t -> t.delay().equals(Duration.ofSeconds(10))));
        assertThat(registry.isMember(id, "p")).isTrue();
        timers.fire(d -> d.equals(Duration.ofSeconds(10)));
        await().atMost(Duration.ofSeconds(5)).until(() -> !registry.isMember(id, "p"));
        assertThat(participation.activityOf("p")).isEmpty();
        flush(2);
        assertThat(lobbyUpdates().getLast().left()).hasSize(1);
        assertThat(registry.liveCount()).isEqualTo(1); // a member's grace never closes the room
    }

    @Test
    void aJoinerWhoseSessionDroppedBeforeHerJoinWasHandledGetsTheGraceAndIsThenRemoved() {
        registry(10, 0, 0, 0, 0, 0, 0);
        UUID id = opened(registry.open(host("h"), config)).roomId();
        // "p" has no session at all here: her drop came before the actor took the join, so it was ignored.
        registry.join(player("p"), "s", "AAAAAA");
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.isMember(id, "p"));
        await().atMost(Duration.ofSeconds(5)).until(() -> timers.pending().stream().anyMatch(t -> t.delay().equals(Duration.ofSeconds(10))));

        timers.fire(d -> d.equals(Duration.ofSeconds(10)));
        await().atMost(Duration.ofSeconds(5)).until(() -> !registry.isMember(id, "p"));
        assertThat(participation.activityOf("p")).isEmpty();
    }

    @Test
    void aConfigureInsideTheWindowCarriesTheJoinAndTheTimerSendsNothingMore() {
        registry(10, 0, 0, 0, 0, 0, 0);
        UUID id = opened(registry.open(host("h"), config)).roomId();
        registry.join(player("p"), "s", "AAAAAA");
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.isMember(id, "p"));
        var joinerId = ((RoomJoinedPayload) sentTo("p", MessageType.ROOM_JOINED).getFirst().payload()).selfParticipantId();

        registry.find(id).orElseThrow().tell(new RoomEvent.Configure("h", "s",
                new in.minnal.game.room.domain.RoomConfigInput(false, null, null, true, 12)));
        await().atMost(Duration.ofSeconds(5)).until(() -> lobbyUpdates().size() == 1);
        RoomLobbyUpdatedPayload update = lobbyUpdates().getFirst();
        assertThat(update.joined()).containsExactly(joinerId);
        assertThat(update.room().questionCount()).isEqualTo(12);
        assertThat(broadcasts.getFirst().seq()).isEqualTo(1L);

        timers.fire(d -> d.equals(Duration.ofMillis(250)));
        registry.find(id).orElseThrow().tell(new RoomEvent.Configure("h", "s",
                new in.minnal.game.room.domain.RoomConfigInput(false, null, null, true, 13)));
        await().atMost(Duration.ofSeconds(5)).until(() -> lobbyUpdates().size() == 2);
        // The fired timer sent nothing: the next broadcast is the second configure, with seq 2 and no joins.
        assertThat(broadcasts.get(1).seq()).isEqualTo(2L);
        assertThat(lobbyUpdates().get(1).joined()).isEmpty();
        assertThat(lobbyUpdates().get(1).room().questionCount()).isEqualTo(13);
    }
}
