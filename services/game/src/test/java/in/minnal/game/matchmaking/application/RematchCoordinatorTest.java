package in.minnal.game.matchmaking.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.internal.QuestionSetRequest;
import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.contracts.realtime.ErrorCode;
import in.minnal.contracts.realtime.ErrorPayload;
import in.minnal.contracts.realtime.MatchFoundPayload;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.RematchDeclineReason;
import in.minnal.contracts.realtime.RematchDeclinedPayload;
import in.minnal.contracts.realtime.RematchRequestedPayload;
import in.minnal.contracts.realtime.ServerMessage;
import in.minnal.game.match.application.BotBrain;
import in.minnal.game.match.application.BotSettings;
import in.minnal.game.match.application.MatchCompletedForRematch;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.application.MatchSettings;
import in.minnal.game.match.application.MatchTimers;
import in.minnal.game.match.application.ScheduledMatchTimers;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.LastSessionClosed;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerChannel;
import in.minnal.game.platform.session.PlayerSessions;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * The rematch window rules (Story 1.10) on the coordinator's own thread, with manual timers, a
 * controllable question-set fetch and a real {@link MatchRegistry} whose matches never leave the
 * lead-in. Every server row of the spec's matrix is here.
 */
class RematchCoordinatorTest {

    static final Duration WINDOW = Duration.ofSeconds(60);
    static final Instant NOW = Instant.parse("2026-11-13T10:00:00Z");
    static final Activity QUEUED = new Activity.Queued(MatchMode.QUICK);

    record Sent(String sub, String sessionId, ServerMessage<?> message) {
    }

    static final class RecordingChannel implements PlayerChannel {

        final List<Sent> sent = new CopyOnWriteArrayList<>();

        @Override
        public void toPlayer(String sub, ServerMessage<?> message) {
            sent.add(new Sent(sub, null, message));
        }

        @Override
        public void toSession(String sub, String sessionId, ServerMessage<?> message) {
            sent.add(new Sent(sub, sessionId, message));
        }

        List<ServerMessage<?>> to(String sub, MessageType type) {
            return sent.stream().filter(s -> s.sub().equals(sub) && s.message().type() == type)
                    .<ServerMessage<?>>map(Sent::message)
                    .toList();
        }
    }

    /** Timers that only run when the test fires them. */
    static final class ManualTimers implements MatchTimers {

        final List<FutureTask<?>> tasks = new CopyOnWriteArrayList<>();

        @Override
        public Future<?> schedule(Duration delay, Runnable task) {
            FutureTask<?> future = new FutureTask<>(task, null);
            tasks.add(future);
            return future;
        }

        void fire(int index) {
            tasks.get(index).run();
        }
    }

    static final class ControlledQuestionSets implements QuestionSetClient {

        final List<QuestionSetRequest> requests = new CopyOnWriteArrayList<>();
        final List<CompletableFuture<QuestionSetResponse>> pending = new CopyOnWriteArrayList<>();

        @Override
        public CompletableFuture<QuestionSetResponse> fetch(QuestionSetRequest request) {
            requests.add(request);
            CompletableFuture<QuestionSetResponse> future = new CompletableFuture<>();
            pending.add(future);
            return future;
        }

        void answerLast() {
            pending.getLast().complete(new QuestionSetResponse(IntStream.range(0, 10)
                    .mapToObj(i -> new InternalQuestion(UUID.randomUUID(), 1, "ചോദ്യം " + i, "Question " + i,
                            List.of("a", "b", "c", "d"), i % 4, "x", null))
                    .toList()));
        }

        void failLast() {
            pending.getLast().completeExceptionally(new IllegalStateException("core down"));
        }
    }

    final ParticipationRegistry participation = new ParticipationRegistry();
    final PlayerSessions sessions = new PlayerSessions(event -> { });
    final RecordingChannel channel = new RecordingChannel();
    final ManualTimers timers = new ManualTimers();
    final ControlledQuestionSets sets = new ControlledQuestionSets();
    final DrainState drain = new DrainState();
    final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    final ScheduledMatchTimers matchTimers = new ScheduledMatchTimers();
    final MatchRegistry matches = new MatchRegistry(participation, sessions, channel, (id, m) -> { }, clock, matchTimers,
            new MatchSettings(Duration.ofHours(1), Duration.ofSeconds(15), Duration.ofMillis(50), Duration.ofSeconds(2)),
            new BotBrain(new BotSettings(Duration.ofMillis(5), Duration.ofMillis(20), 0.65, 0.1), new Random(7)), drain,
            new SimpleMeterRegistry(), event -> { });
    final RematchCoordinator coordinator = new RematchCoordinator(drain, participation, sessions, channel, clock, sets,
            matches, timers, WINDOW);

    @AfterEach
    void stop() {
        coordinator.destroy();
        matches.destroy();
        matchTimers.destroy();
    }

    /** An ended QUICK match of {@code humans} (subs) and maybe a bot, each human connected; its window is open. */
    MatchSetup ended(List<String> humans, boolean withBot, Set<String> forfeitedSubs) {
        List<Participant> participants = new ArrayList<>();
        Map<String, UUID> bySub = new LinkedHashMap<>();
        Map<UUID, Integer> ratings = new LinkedHashMap<>();
        List<UUID> forfeited = new ArrayList<>();
        int rating = 1350;
        for (String sub : humans) {
            UUID id = UUID.randomUUID();
            participants.add(new Participant(id, "Guest " + sub, ParticipantKind.GUEST));
            bySub.put(sub, id);
            ratings.put(id, rating);
            rating += 100;
            sessions.connected(sub, "s-" + sub);
            if (forfeitedSubs.contains(sub)) {
                forfeited.add(id);
            }
        }
        if (withBot) {
            UUID bot = UUID.randomUUID();
            participants.add(new Participant(bot, "Minnal Bot", ParticipantKind.BOT));
            ratings.put(bot, 1350);
        }
        MatchSetup setup = new MatchSetup(UUID.randomUUID(), MatchMode.QUICK, participants, bySub, List.of(), Map.of(),
                ratings, NOW.minusSeconds(90));
        coordinator.onMatchCompleted(new MatchCompletedForRematch(setup, Set.copyOf(forfeited), NOW));
        return setup;
    }

    MatchSetup ended(List<String> humans, boolean withBot) {
        return ended(humans, withBot, Set.of());
    }

    void request(String sub, MatchSetup setup) {
        coordinator.request(sub, "s-" + sub, setup.matchId().toString());
    }

    /** Waits until everything told so far was handled (the actor is FIFO). */
    void settle() {
        String marker = "marker-" + UUID.randomUUID();
        coordinator.request(marker, "s", UUID.randomUUID().toString());
        await().atMost(Duration.ofSeconds(2)).until(() -> !channel.to(marker, MessageType.REMATCH_DECLINED).isEmpty());
    }

    RematchDeclineReason lastDecline(String sub) {
        List<ServerMessage<?>> declines = channel.to(sub, MessageType.REMATCH_DECLINED);
        assertThat(declines).as("a decline to %s", sub).isNotEmpty();
        return ((RematchDeclinedPayload) declines.getLast().payload()).reason();
    }

    MatchFoundPayload matchFound(String sub) {
        await().atMost(Duration.ofSeconds(2)).until(() -> !channel.to(sub, MessageType.MATCH_FOUND).isEmpty());
        return (MatchFoundPayload) channel.to(sub, MessageType.MATCH_FOUND).getLast().payload();
    }

    @Test
    void theBotAcceptsAtOnceAndANewMatchStartsWithTheSameParticipants() {
        MatchSetup old = ended(List.of("anju"), true);
        request("anju", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        assertThat(sets.requests.getFirst().requesterId()).isEqualTo("anju");
        assertThat(participation.activityOf("anju")).contains(QUEUED);

        sets.answerLast();

        MatchFoundPayload found = matchFound("anju");
        assertThat(found.matchId()).isNotEqualTo(old.matchId());
        assertThat(found.mode()).isEqualTo(MatchMode.QUICK);
        assertThat(found.participants()).extracting(Participant::displayName).containsExactly("Guest anju", "Minnal Bot");
        assertThat(found.participants()).extracting(Participant::kind)
                .containsExactly(ParticipantKind.GUEST, ParticipantKind.BOT);
        assertThat(participation.activityOf("anju")).contains(new Activity.InMatch(found.matchId()));
        MatchSetup next = matches.find(found.matchId()).orElseThrow().setup();
        assertThat(next.ratings().values()).as("her old rating, the bot at hers").containsOnly(1350);
        assertThat(next.queueWaitMs()).containsEntry("anju", 0L);
        assertThat(channel.to("anju", MessageType.REMATCH_REQUESTED)).as("no waiting state against the bot").isEmpty();

        request("anju", old);
        settle();
        assertThat(lastDecline("anju")).as("the window closed once the rematch started")
                .isEqualTo(RematchDeclineReason.UNAVAILABLE);
    }

    @Test
    void aFailedFetchSendsMatchmakingFailedReleasesHerAndRematchCanBeSentAgain() {
        MatchSetup old = ended(List.of("anju"), true);
        request("anju", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        sets.failLast();
        await().atMost(Duration.ofSeconds(2)).until(() -> !channel.to("anju", MessageType.MATCHMAKING_FAILED).isEmpty());
        assertThat(participation.activityOf("anju")).isEmpty();

        request("anju", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 2);
        sets.answerLast();
        matchFound("anju");
    }

    @Test
    void whenBothHumansAskTheNewMatchStartsForBoth() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        settle();
        for (String sub : List.of("anju", "vishnu")) {
            List<ServerMessage<?>> requested = channel.to(sub, MessageType.REMATCH_REQUESTED);
            assertThat(requested).hasSize(1);
            assertThat(requested.getFirst().matchId()).isEqualTo(old.matchId());
            RematchRequestedPayload payload = (RematchRequestedPayload) requested.getFirst().payload();
            assertThat(payload.requestedBy()).isEqualTo(old.humans().get("anju"));
            assertThat(payload.expiresAt()).isEqualTo(NOW.plus(WINDOW));
        }
        assertThat(sets.requests).as("one ask is not enough").isEmpty();

        request("vishnu", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        sets.answerLast();
        MatchFoundPayload anju = matchFound("anju");
        MatchFoundPayload vishnu = matchFound("vishnu");
        assertThat(anju.matchId()).isEqualTo(vishnu.matchId()).isNotEqualTo(old.matchId());
        assertThat(anju.selfParticipantId()).isNotEqualTo(vishnu.selfParticipantId());
        MatchSetup next = matches.find(anju.matchId()).orElseThrow().setup();
        assertThat(next.ratings().get(anju.selfParticipantId())).isEqualTo(1350);
        assertThat(next.ratings().get(vishnu.selfParticipantId())).isEqualTo(1450);
    }

    @Test
    void aCancelRevertsTheOpponentWithCancelled() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        coordinator.cancel("anju", old.matchId().toString());
        settle();
        assertThat(lastDecline("vishnu")).isEqualTo(RematchDeclineReason.CANCELLED);
        assertThat(channel.to("anju", MessageType.REMATCH_DECLINED)).isEmpty();

        request("vishnu", old);
        settle();
        assertThat(sets.requests).as("anju's request was withdrawn").isEmpty();
        assertThat(channel.to("anju", MessageType.REMATCH_REQUESTED)).hasSize(2);
    }

    @Test
    void anUnansweredRequestExpiresForBothAndAReSendRefreshesItsDeadline() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        request("anju", old); // a re-send: a new deadline
        settle();
        // tasks: 0 = the window's end, 1 = the first deadline, 2 = the re-send's deadline
        timers.fire(1);
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_EXPIRED)).as("the first deadline is stale").isEmpty();

        timers.fire(2);
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_EXPIRED)).hasSize(1);
        assertThat(channel.to("vishnu", MessageType.REMATCH_EXPIRED)).hasSize(1);
        assertThat(channel.to("vishnu", MessageType.REMATCH_EXPIRED).getFirst().matchId()).isEqualTo(old.matchId());

        request("anju", old); // within the window: a new 60 s
        settle();
        assertThat(channel.to("vishnu", MessageType.REMATCH_REQUESTED)).hasSize(3);
    }

    @Test
    void aRequestToAnOpponentWhoLeftOrIsBusyIsUnavailable() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        sessions.disconnected("vishnu", "s-vishnu");
        request("anju", old);
        settle();
        assertThat(lastDecline("anju")).isEqualTo(RematchDeclineReason.UNAVAILABLE);

        sessions.connected("vishnu", "s-vishnu");
        participation.claim("vishnu", QUEUED);
        request("anju", old);
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_DECLINED)).hasSize(2);
        assertThat(channel.to("vishnu", MessageType.REMATCH_REQUESTED)).isEmpty();
    }

    @Test
    void aRequesterWhoIsBusyIsUnavailable() {
        MatchSetup bot = ended(List.of("meera"), true);
        participation.claim("meera", new Activity.InMatch(UUID.randomUUID()));
        request("meera", bot);
        settle();
        assertThat(lastDecline("meera")).isEqualTo(RematchDeclineReason.UNAVAILABLE);
        assertThat(sets.requests).isEmpty();
    }

    /** Owner, 2026-11-13: a human who forfeited or left may still rematch, connected and free. */
    @Test
    void aForfeiterMayRequestAndBeAsked() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false, Set.of("vishnu"));
        request("vishnu", old);
        settle();
        assertThat(channel.to("vishnu", MessageType.REMATCH_DECLINED)).isEmpty();
        assertThat(channel.to("anju", MessageType.REMATCH_REQUESTED)).hasSize(1);
        request("anju", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        sets.answerLast();
        assertThat(matchFound("vishnu").matchId()).isEqualTo(matchFound("anju").matchId());

        MatchSetup bot = ended(List.of("meera"), true, Set.of("meera"));
        request("meera", bot);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 2);
        sets.answerLast();
        matchFound("meera");
    }

    @Test
    void aPendingRequestRevertsWhenTheOpponentJoinsMatchmakingOrLeaves() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        coordinator.joinedMatchmaking("vishnu");
        settle();
        assertThat(lastDecline("anju")).isEqualTo(RematchDeclineReason.UNAVAILABLE);

        MatchSetup other = ended(List.of("meera", "rahul"), false);
        request("meera", other);
        coordinator.onLastSessionClosed(new LastSessionClosed("meera"));
        settle();
        assertThat(lastDecline("rahul")).as("the requester left: the opponent reverts")
                .isEqualTo(RematchDeclineReason.UNAVAILABLE);
    }

    @Test
    void aLateRequestOrAnUnknownMatchOrAStrangerIsUnavailable() {
        MatchSetup old = ended(List.of("anju"), true);
        coordinator.request("anju", "s-anju", UUID.randomUUID().toString());
        coordinator.request("anju", "s-anju", "not-a-uuid");
        coordinator.request("stranger", "s-x", old.matchId().toString());
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_DECLINED)).hasSize(2);
        assertThat(lastDecline("stranger")).isEqualTo(RematchDeclineReason.UNAVAILABLE);

        timers.fire(0); // 60 s since the end, nothing pending
        request("anju", old);
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_DECLINED)).hasSize(3);
        assertThat(sets.requests).isEmpty();
    }

    /** Owner, 2026-11-13: the idle 60 s restart at an expiry, so a re-send after it works. */
    @Test
    void aReSendAfterAnExpiryPastTheEndPlus60sStartsAFresh60sAndCanBeAccepted() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        settle();
        // tasks: 0 = the end's idle period, 1 = anju's deadline
        timers.fire(0); // the end + 60 s, but a request is pending: stays open
        timers.fire(1); // it expires; tasks: 2 = the idle period from the expiry
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_EXPIRED)).hasSize(1);

        request("anju", old); // a re-send: a fresh 60 s
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_DECLINED)).isEmpty();
        assertThat(channel.to("vishnu", MessageType.REMATCH_REQUESTED)).hasSize(2);
        timers.fire(2); // stale: a request is pending again
        request("vishnu", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        sets.answerLast();
        matchFound("anju");
    }

    @Test
    void sixtySecondsIdleAfterAnExpiryCloseTheWindow() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        settle();
        timers.fire(1); // expiry; task 2 = the idle period from it
        settle();
        timers.fire(0); // stale: the end's idle period was stopped by the request
        request("anju", old);
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_DECLINED)).as("still open").isEmpty();
        coordinator.cancel("anju", old.matchId().toString()); // idle again: task 4 (3 = the deadline)
        settle();
        timers.fire(4);
        request("anju", old);
        settle();
        assertThat(lastDecline("anju")).as("60 s idle after the cancel").isEqualTo(RematchDeclineReason.UNAVAILABLE);
    }

    @Test
    void aRequestPendingWhenTheWindowRunsOutKeepsItOpenUntilItsOwnDeadline() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        settle();
        timers.fire(0); // the end + 60 s
        request("vishnu", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        sets.answerLast();
        matchFound("vishnu");
    }

    @Test
    void aCancelDuringTheFetchAgainstTheBotCallsTheStartOffAndTheWindowStaysOpen() {
        MatchSetup old = ended(List.of("anju"), true);
        request("anju", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        coordinator.cancel("anju", old.matchId().toString());
        sets.answerLast();
        settle();
        assertThat(channel.to("anju", MessageType.MATCH_FOUND)).isEmpty();
        assertThat(channel.to("anju", MessageType.REMATCH_DECLINED)).isEmpty();
        assertThat(participation.activityOf("anju")).isEmpty();

        request("anju", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 2);
        sets.answerLast();
        matchFound("anju");
    }

    @Test
    void aCancelDuringTheFetchBetweenHumansRevertsTheOtherWithCancelled() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        request("vishnu", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        coordinator.cancel("anju", old.matchId().toString());
        sets.answerLast();
        settle();
        assertThat(lastDecline("vishnu")).isEqualTo(RematchDeclineReason.CANCELLED);
        assertThat(channel.to("anju", MessageType.REMATCH_DECLINED)).isEmpty();
        assertThat(channel.to("anju", MessageType.MATCH_FOUND)).isEmpty();
        assertThat(channel.to("vishnu", MessageType.MATCH_FOUND)).isEmpty();
        assertThat(participation.activityOf("anju")).isEmpty();
        assertThat(participation.activityOf("vishnu")).isEmpty();
    }

    @Test
    void aHumanWhoLeftDuringTheFetchIsNotStartedAndTheOtherGetsUnavailable() {
        MatchSetup old = ended(List.of("anju", "vishnu"), false);
        request("anju", old);
        request("vishnu", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        sessions.disconnected("vishnu", "s-vishnu");
        coordinator.onLastSessionClosed(new LastSessionClosed("vishnu"));
        sets.answerLast();
        settle();
        assertThat(lastDecline("anju")).isEqualTo(RematchDeclineReason.UNAVAILABLE);
        assertThat(channel.to("vishnu", MessageType.REMATCH_DECLINED)).isEmpty();
        assertThat(channel.to("anju", MessageType.MATCH_FOUND)).isEmpty();
        assertThat(participation.activityOf("anju")).isEmpty();
        assertThat(participation.activityOf("vishnu")).isEmpty();
    }

    @Test
    void startingARematchWithdrawsAnotherWindowsPendingRequestInvolvingItsHumans() {
        MatchSetup withBot = ended(List.of("anju"), true); // task 0: its idle period
        MatchSetup withMeera = ended(List.of("meera", "anju"), false); // task 1
        request("meera", withMeera); // task 2: meera's deadline
        settle();
        assertThat(channel.to("anju", MessageType.REMATCH_REQUESTED)).hasSize(1);

        request("anju", withBot);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        settle();
        assertThat(lastDecline("meera")).isEqualTo(RematchDeclineReason.UNAVAILABLE);
        timers.fire(2);
        settle();
        assertThat(channel.to("meera", MessageType.REMATCH_EXPIRED)).as("her pending request was dropped").isEmpty();
    }

    @Test
    void whileDrainingARequestGetsServerDraining() {
        MatchSetup old = ended(List.of("anju"), true);
        drain.begin();
        request("anju", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> !channel.to("anju", MessageType.ERROR).isEmpty());
        assertThat(((ErrorPayload) channel.to("anju", MessageType.ERROR).getFirst().payload()).code())
                .isEqualTo(ErrorCode.SERVER_DRAINING);
        assertThat(sets.requests).isEmpty();
    }

    @Test
    void drainingThatBeginsDuringTheFetchReleasesBothWithServerDraining() {
        MatchSetup old = ended(List.of("anju"), true);
        request("anju", old);
        await().atMost(Duration.ofSeconds(2)).until(() -> sets.requests.size() == 1);
        drain.begin();
        sets.answerLast();
        await().atMost(Duration.ofSeconds(2)).until(() -> !channel.to("anju", MessageType.ERROR).isEmpty());
        assertThat(participation.activityOf("anju")).isEmpty();
        assertThat(channel.to("anju", MessageType.MATCH_FOUND)).isEmpty();
    }
}
