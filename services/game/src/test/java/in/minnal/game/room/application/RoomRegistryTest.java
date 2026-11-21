package in.minnal.game.room.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.identity.Role;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.RoomClosedReason;
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
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
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
        registry(10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        UUID first = opened(registry.open(host("a"), config)).roomId();
        assertThat(participation.activityOf("a")).contains(new Activity.InRoom(first));

        registry.find(first).orElseThrow().tell(new RoomEvent.Leave("a", "s1"));
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.liveCount() == 0);

        assertThat(participation.activityOf("a")).isEmpty();
        assertThat(registry.findByCode("AAAAAA")).isEmpty();
        assertThat(registry.isMember(first, "a")).isFalse();
        // The same code is drawn again and is free.
        UUID second = opened(registry.open(host("b"), config)).roomId();
        assertThat(registry.find(second).orElseThrow().code()).isEqualTo("AAAAAA");
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
        participation = new ParticipationRegistry() {
            @Override
            public boolean release(String sub, Activity expected) {
                throw new IllegalStateException("release failed");
            }
        };
        registry(10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        UUID first = opened(registry.open(host("a"), config)).roomId();

        registry.find(first).orElseThrow().tell(new RoomEvent.Leave("a", "s1"));
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.liveCount() == 0);

        assertThat(registry.findByCode("AAAAAA")).isEmpty();
        assertThat(registry.find(first)).isEmpty();
        // The code can be drawn again by a new room (another sub: the failed release left "a" claimed).
        UUID second = opened(registry.open(host("b"), config)).roomId();
        assertThat(registry.find(second).orElseThrow().code()).isEqualTo("AAAAAA");
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
}
