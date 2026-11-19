package in.minnal.game.match.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.realtime.AbortReason;
import in.minnal.contracts.realtime.AnswerRequest;
import in.minnal.contracts.realtime.ErrorPayload;
import in.minnal.contracts.realtime.MatchAbortedPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.contracts.realtime.SnapshotPayload;
import in.minnal.game.match.application.MatchTestKit.RecordingBroadcaster;
import in.minnal.game.match.application.MatchTestKit.RecordingChannel;
import in.minnal.game.match.domain.Connection;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.LastSessionClosed;
import in.minnal.game.platform.session.MatchBroadcaster;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerSessions;
import in.minnal.game.platform.session.SessionOpened;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.stream.LongStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class MatchRegistryTest {

    final ParticipationRegistry participation = new ParticipationRegistry();
    final PlayerSessions sessions = new PlayerSessions(event -> { });
    final RecordingChannel channel = new RecordingChannel();
    final RecordingBroadcaster broadcaster = new RecordingBroadcaster();
    final ScheduledMatchTimers timers = new ScheduledMatchTimers();
    final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    final BotBrain bots = new BotBrain(new BotSettings(Duration.ofMillis(5), Duration.ofMillis(20), 0.65, 0.1), new Random(7));

    final DrainState drain = new DrainState();

    MatchRegistry registry(Duration window) {
        return registry(window, broadcaster);
    }

    MatchRegistry registry(Duration window, MatchBroadcaster broadcasts) {
        return registry(MatchTestKit.fast(window), broadcasts);
    }

    MatchRegistry registry(MatchSettings settings, MatchBroadcaster broadcasts) {
        return new MatchRegistry(participation, sessions, channel, broadcasts, Clock.systemUTC(), timers,
                settings, bots, drain, meters, event -> { });
    }

    MatchRegistry registry;

    @AfterEach
    void stop() {
        if (registry != null) {
            registry.destroy();
        }
        timers.destroy();
    }

    MatchSetup claimed(MatchSetup setup) {
        setup.humans().keySet().forEach(sub -> {
            participation.claim(sub, new Activity.Queued(MatchMode.QUICK));
            sessions.connected(sub, "s-" + sub);
        });
        return setup;
    }

    @Test
    void aMatchRunsItsTenQuestionsThenEndsAndReleasesItsHumans() {
        registry = registry(Duration.ofMillis(40));
        MatchSetup setup = claimed(MatchTestKit.setup(2, 0, 10));
        MatchActor match = registry.start(setup).orElseThrow();
        assertThat(participation.matchOf("h0")).contains(setup.matchId());
        assertThat(participation.matchOf("h1")).contains(setup.matchId());
        assertThat(registry.liveCount()).isEqualTo(1);
        assertThat(registry.isParticipant(setup.matchId(), "h0")).isTrue();
        assertThat(registry.isParticipant(setup.matchId(), "stranger")).isFalse();
        assertThat(registry.participantId(setup.matchId(), "h1")).contains(setup.humans().get("h1"));

        await().atMost(Duration.ofSeconds(10)).until(() -> registry.liveCount() == 0);
        assertThat(match.isEnded()).isTrue();
        assertThat(participation.activityOf("h0")).isEmpty();
        assertThat(participation.activityOf("h1")).isEmpty();
        assertThat(registry.find(setup.matchId())).isEmpty();
        assertThat(registry.isParticipant(setup.matchId(), "h0")).as("an ended match has no participants").isFalse();
        assertThat(meters.get(MatchMetrics.ENDED).counter().count()).isEqualTo(1);
        assertThat(meters.get(MatchMetrics.FAILED).counter().count()).isZero();

        // A late answer from one of its players: ANSWER_REJECTED with the last seq (the match is gone).
        registry.answer("h0", "s-h0", setup.matchId().toString(), new AnswerRequest(9, 0), Instant.now());
        assertThat(channel.sent).last().satisfies(sent -> {
            assertThat(((ErrorPayload) sent.message().payload()).code().name()).isEqualTo("ANSWER_REJECTED");
            assertThat(sent.message().refSeq()).isEqualTo(20);
            assertThat(sent.sessionId()).isEqualTo("s-h0");
        });
        registry.answer("stranger", "s9", setup.matchId().toString(), new AnswerRequest(9, 0), Instant.now());
        assertThat(((ErrorPayload) channel.sent.getLast().message().payload()).code().name()).isEqualTo("NOT_IN_MATCH");

        // 10 starts and 10 reveals, alternating, numbered 1..20.
        assertThat(broadcaster.all).extracting(ServerMessage::type).containsExactly(LongStream.range(0, 20)
                .mapToObj(i -> i % 2 == 0 ? MessageType.QUESTION_STARTED : MessageType.QUESTION_REVEALED)
                .toArray(MessageType[]::new));
        assertThat(broadcaster.all).extracting(ServerMessage::seq)
                .containsExactly(LongStream.rangeClosed(1, 20).boxed().toArray(Long[]::new));
        assertThat(meters.get(MatchMetrics.BROADCAST_LAG).tag("type", "QUESTION_REVEALED").timer().count()).isEqualTo(10);
    }

    /** Within the reconnect grace (10 s by default) a disconnect only marks the participant. */
    @Test
    void aDisconnectMarksTheParticipantButTheMatchRunsToTheEnd() {
        registry = registry(Duration.ofMillis(80));
        MatchSetup setup = claimed(MatchTestKit.setup(2, 0, 2));
        MatchActor match = registry.start(setup).orElseThrow();
        sessions.disconnected("h0", "s-h0");
        sessions.disconnected("h1", "s-h1");
        registry.onLastSessionClosed(new LastSessionClosed("h0"));
        registry.onLastSessionClosed(new LastSessionClosed("h1"));
        await().atMost(Duration.ofSeconds(2)).until(() -> match.state().participants().stream()
                .allMatch(p -> p.connection() == Connection.DISCONNECTED));
        assertThat(registry.liveCount()).as("all humans gone, the match still runs").isEqualTo(1);
        assertThat(participation.matchOf("h0")).contains(setup.matchId());
        await().atMost(Duration.ofSeconds(5)).until(() -> registry.liveCount() == 0);
        assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED)).hasSize(2);
        assertThat(participation.activityOf("h0")).isEmpty();
    }

    @Test
    void anAnswerFromAnOutsiderOrForAnUnknownMatchIsNotInMatch() {
        registry = registry(Duration.ofSeconds(5));
        MatchSetup setup = claimed(MatchTestKit.setup(1, 1, 1));
        registry.start(setup);
        registry.answer("stranger", "s9", setup.matchId().toString(), new AnswerRequest(0, 0), Instant.now());
        registry.answer("h0", "s-h0", UUID.randomUUID().toString(), new AnswerRequest(0, 0), Instant.now());
        registry.answer("h0", "s-h0", "not-a-uuid", new AnswerRequest(0, 0), Instant.now());
        assertThat(channel.sent).hasSize(3).allSatisfy(sent -> {
            assertThat(sent.message().type()).isEqualTo(MessageType.ERROR);
            assertThat(((ErrorPayload) sent.message().payload()).code().name()).isEqualTo("NOT_IN_MATCH");
            assertThat(sent.sessionId()).as("to the asking session only").isNotNull();
        });
        assertThat(channel.sent.get(0).message().matchId()).isEqualTo(setup.matchId());
        assertThat(channel.sent.get(2).message().matchId()).isNull();
    }

    @Test
    void theEndNeverReleasesALaterActivity() {
        registry = registry(Duration.ofMillis(30));
        MatchSetup setup = claimed(MatchTestKit.setup(1, 1, 1));
        registry.start(setup);
        UUID later = UUID.randomUUID();
        participation.replace("h0", new Activity.InMatch(later));
        await().atMost(Duration.ofSeconds(3)).until(() -> registry.liveCount() == 0);
        assertThat(participation.matchOf("h0")).contains(later);
    }

    /**
     * The drain race: matchmaking saw "not draining", then draining began and MatchDrain found no live
     * match and returned; only then does the pairing call start(). It must be refused, not cut later.
     */
    @Test
    void startIsRefusedOnceDrainingBeganSoTheDrainNeverMissesAMatch() throws InterruptedException {
        registry = registry(Duration.ofMillis(100));
        assertThat(drain.isDraining()).isFalse(); // what the matchmaking actor saw
        drain.begin();
        MatchDrain matchDrain = new MatchDrain(registry, Duration.ofSeconds(5));
        matchDrain.start();
        matchDrain.stop(); // returns at once: nothing live
        MatchSetup setup = claimed(MatchTestKit.setup(1, 1, 2));
        assertThat(registry.start(setup)).isEmpty();
        assertThat(registry.liveCount()).isZero();
        assertThat(participation.matchOf("h0")).as("left for the caller to release").isEmpty();
        assertThat(broadcaster.all).isEmpty();
        assertThat(registry.awaitNoLiveMatches(Duration.ZERO)).isTrue();
    }

    @Test
    void aMatchStartedBeforeDrainingIsWaitedFor() throws InterruptedException {
        registry = registry(Duration.ofMillis(100));
        registry.start(claimed(MatchTestKit.setup(1, 1, 2))).orElseThrow();
        drain.begin();
        assertThat(registry.liveCount()).isEqualTo(1);
        assertThat(registry.awaitNoLiveMatches(Duration.ofSeconds(5))).isTrue();
        assertThat(broadcaster.ofType(MessageType.QUESTION_REVEALED)).hasSize(2);
    }

    /** A handler that throws (here: the 3rd broadcast) ends the match and frees its players. */
    @Test
    void anErrorInsideTheMatchEndsItAndFreesItsPlayers() throws InterruptedException {
        java.util.concurrent.atomic.AtomicInteger sends = new java.util.concurrent.atomic.AtomicInteger();
        MatchBroadcaster failing = (matchId, message) -> {
            if (sends.incrementAndGet() == 3) {
                throw new IllegalStateException("broker down");
            }
            broadcaster.broadcast(matchId, message);
        };
        registry = registry(Duration.ofMillis(40), failing);
        MatchSetup setup = claimed(MatchTestKit.setup(2, 0, 10));
        MatchActor match = registry.start(setup).orElseThrow();
        assertThat(registry.awaitNoLiveMatches(Duration.ofSeconds(5))).isTrue();
        assertThat(match.isEnded()).as("onEnded fired and the actor stopped").isTrue();
        assertThat(registry.liveCount()).isZero();
        assertThat(participation.activityOf("h0")).isEmpty();
        assertThat(participation.activityOf("h1")).isEmpty();
        assertThat(meters.get(MatchMetrics.FAILED).counter().count()).isEqualTo(1);
        assertThat(meters.get(MatchMetrics.ENDED).counter().count()).isZero();
        // Story 1.9: the failure is broadcast as MATCH_ABORTED{ERROR} before the end.
        assertThat(broadcaster.all).extracting(ServerMessage::type).containsExactly(MessageType.QUESTION_STARTED,
                MessageType.QUESTION_REVEALED, MessageType.MATCH_ABORTED);
        assertThat(((MatchAbortedPayload) broadcaster.all.getLast().payload()).reason()).isEqualTo(AbortReason.ERROR);
    }

    @Test
    void awaitNoLiveMatchesReturnsOnceTheLastEnds() throws InterruptedException {
        registry = registry(Duration.ofMillis(100));
        registry.start(claimed(MatchTestKit.setup(1, 1, 2))).orElseThrow();
        assertThat(registry.awaitNoLiveMatches(Duration.ofMillis(20))).isFalse();
        assertThat(registry.awaitNoLiveMatches(Duration.ofSeconds(5))).isTrue();
        List<ServerMessage<?>> reveals = broadcaster.ofType(MessageType.QUESTION_REVEALED);
        assertThat(reveals).hasSize(2);
    }

    // -----------------------------------------------------------------------------------------
    // Story 1.9

    @Test
    void aGraceForfeitReleasesHerAtOnceWhileTheMatchGoesOnForTheOther() {
        registry = registry(MatchTestKit.fast(Duration.ofSeconds(5), Duration.ofMillis(150)), broadcaster);
        MatchSetup setup = claimed(MatchTestKit.room(MatchTestKit.setup(3, 0, 2)));
        MatchActor match = registry.start(setup).orElseThrow();
        sessions.disconnected("h0", "s-h0");
        registry.onLastSessionClosed(new LastSessionClosed("h0"));
        await().atMost(Duration.ofSeconds(3)).until(() -> participation.activityOf("h0").isEmpty());
        assertThat(broadcaster.ofType(MessageType.PARTICIPANT_FORFEITED)).hasSize(1);
        assertThat(participation.matchOf("h1")).as("the other plays on").contains(setup.matchId());
        assertThat(registry.liveCount()).isEqualTo(1);
        assertThat(match.isEnded()).isFalse();
    }

    @Test
    void aNewSessionCancelsTheGrace() throws InterruptedException {
        registry = registry(MatchTestKit.fast(Duration.ofSeconds(5), Duration.ofMillis(200)), broadcaster);
        MatchSetup setup = claimed(MatchTestKit.setup(2, 0, 2));
        MatchActor match = registry.start(setup).orElseThrow();
        sessions.disconnected("h0", "s-h0");
        registry.onLastSessionClosed(new LastSessionClosed("h0"));
        sessions.connected("h0", "s2-h0");
        registry.onSessionOpened(new SessionOpened("h0"));
        Thread.sleep(500);
        assertThat(broadcaster.ofType(MessageType.PARTICIPANT_FORFEITED)).isEmpty();
        assertThat(match.state().participants().getFirst().connection()).isEqualTo(Connection.CONNECTED);
        assertThat(participation.matchOf("h0")).contains(setup.matchId());
    }

    @Test
    void leavingBeforeTheFirstRevealAbortsAndCountsAborted() {
        registry = registry(Duration.ofSeconds(5));
        MatchSetup setup = claimed(MatchTestKit.setup(1, 1, 10));
        registry.start(setup).orElseThrow();
        registry.leave("stranger", setup.matchId().toString()); // ignored
        registry.leave("h0", "not-a-uuid"); // ignored
        registry.leave("h0", setup.matchId().toString());
        await().atMost(Duration.ofSeconds(3)).until(() -> registry.liveCount() == 0);
        assertThat(broadcaster.all).extracting(ServerMessage::type)
                .endsWith(MessageType.PARTICIPANT_FORFEITED, MessageType.MATCH_ABORTED);
        assertThat(((MatchAbortedPayload) broadcaster.all.getLast().payload()).reason()).isEqualTo(AbortReason.ALL_LEFT);
        assertThat(meters.get(MatchMetrics.ABORTED).counter().count()).isEqualTo(1);
        assertThat(meters.get(MatchMetrics.ENDED).counter().count()).isZero();
        assertThat(meters.get(MatchMetrics.FAILED).counter().count()).isZero();
        assertThat(participation.activityOf("h0")).isEmpty();
    }

    // -----------------------------------------------------------------------------------------
    // Story 1.10 (part 2): the rematch window opens for a completed QUICK match only

    final List<Object> events = new java.util.concurrent.CopyOnWriteArrayList<>();

    MatchRegistry publishing(MatchSettings settings) {
        return new MatchRegistry(participation, sessions, channel, broadcaster, Clock.systemUTC(), timers, settings, bots,
                drain, meters, event -> { }, events::add);
    }

    @Test
    void aCompletedQuickMatchOpensItsRematchWindowWithItsForfeitersAfterReleasingItsHumans() {
        registry = publishing(MatchTestKit.fast(Duration.ofMillis(40)));
        MatchSetup setup = claimed(MatchTestKit.setup(2, 0, 3));
        registry.start(setup).orElseThrow();
        registry.leave("h1", setup.matchId().toString());
        await().atMost(Duration.ofSeconds(10)).until(() -> !events.isEmpty());
        assertThat(events).singleElement().isInstanceOfSatisfying(MatchCompletedForRematch.class, ended -> {
            assertThat(ended.setup()).isEqualTo(setup);
            assertThat(ended.forfeitedParticipantIds()).containsExactly(setup.humans().get("h1"));
            assertThat(ended.endedAt()).isNotNull();
        });
        assertThat(participation.activityOf("h0")).as("released before the window opens").isEmpty();
    }

    @Test
    void anAbortedMatchOpensNoRematchWindow() {
        registry = publishing(MatchTestKit.fast(Duration.ofSeconds(5)));
        MatchSetup setup = claimed(MatchTestKit.setup(1, 1, 10));
        registry.start(setup).orElseThrow();
        registry.leave("h0", setup.matchId().toString());
        await().atMost(Duration.ofSeconds(3)).until(() -> registry.liveCount() == 0);
        assertThat(events).isEmpty();
    }

    @Test
    void resyncRepliesWithASnapshotToThatSessionOrNotInMatch() {
        registry = registry(Duration.ofSeconds(5));
        MatchSetup setup = claimed(MatchTestKit.setup(1, 1, 10));
        registry.start(setup).orElseThrow();
        registry.resync("h0", "s-h0", setup.matchId().toString());
        await().atMost(Duration.ofSeconds(2)).until(() -> !channel.to("h0").isEmpty());
        assertThat(channel.to("h0").getFirst()).satisfies(sent -> {
            assertThat(sent.sessionId()).isEqualTo("s-h0");
            assertThat(sent.message().type()).isEqualTo(MessageType.SNAPSHOT);
            assertThat(((SnapshotPayload) sent.message().payload()).participants()).hasSize(2);
        });
        registry.resync("stranger", "s9", setup.matchId().toString());
        registry.resync("h0", "s-h0", UUID.randomUUID().toString());
        assertThat(channel.sent.subList(1, 3)).allSatisfy(sent ->
                assertThat(((ErrorPayload) sent.message().payload()).code().name()).isEqualTo("NOT_IN_MATCH"));
    }

    @Test
    void resyncForAnEndedMatchIsNotInMatch() {
        registry = registry(Duration.ofMillis(30));
        MatchSetup setup = claimed(MatchTestKit.setup(1, 1, 1));
        registry.start(setup).orElseThrow();
        await().atMost(Duration.ofSeconds(3)).until(() -> registry.liveCount() == 0);
        registry.resync("h0", "s-h0", setup.matchId().toString());
        assertThat(((ErrorPayload) channel.sent.getLast().message().payload()).code().name()).isEqualTo("NOT_IN_MATCH");
    }
}
