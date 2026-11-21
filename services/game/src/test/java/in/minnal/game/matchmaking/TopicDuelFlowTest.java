package in.minnal.game.matchmaking;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.TopicInfo;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.matchmaking.application.RatingCache;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/** Story 4.2: Topic Duel matchmaking per {@code (mode, topicId)}, the 422 mapping, the guest rule and rematch. */
@TestPropertySource(properties = "minnal.rematch.window=3s")
class TopicDuelFlowTest extends GameIntegrationTest {

    static final Duration TWO_TICKS = Duration.ofMillis(600);
    static final UUID TOPIC_A = UUID.randomUUID();
    static final UUID TOPIC_B = UUID.randomUUID();

    @Autowired
    RatingCache ratings;

    @Autowired
    MeterRegistry meters;

    @Autowired
    MatchRegistry matches;

    final List<StompTestClient> clients = new ArrayList<>();
    final List<String> subs = new ArrayList<>();

    @BeforeEach
    void coreAnswers() {
        CORE.reset();
    }

    @AfterEach
    void leave() {
        CORE.reset();
        clients.forEach(StompTestClient::close);
        awaitIdle(subs.toArray(String[]::new));
    }

    StompTestClient user(String sub) {
        subs.add(sub);
        StompTestClient client = connect(userToken(sub, "Player " + sub.substring(0, 4)));
        clients.add(client);
        return client;
    }

    StompTestClient guest(String sub) {
        subs.add(sub);
        StompTestClient client = connect(guestToken(sub));
        clients.add(client);
        return client;
    }

    static void duel(StompTestClient client, UUID topic) {
        client.send("/app/matchmaking/TOPIC_DUEL/join", "{\"topicId\":\"" + topic + "\"}");
    }

    static void leaveMatch(StompTestClient client, JsonNode matchFound) {
        client.send("/app/match/" + matchFound.get("matchId").asString() + "/leave");
    }

    @Test
    void twoPlayersOnTheSameTopicArePairedWithTopicQuestionsAndTheTopicOnMatchFound() {
        String a = newSub();
        String b = newSub();
        StompTestClient anju = user(a);
        StompTestClient biju = user(b);
        duel(anju, TOPIC_A);
        anju.expectNothing(Duration.ofMillis(300));
        duel(biju, TOPIC_A);

        JsonNode toAnju = anju.next("MATCH_FOUND");
        JsonNode toBiju = biju.next("MATCH_FOUND");
        JsonNode payload = toAnju.get("payload");
        assertThat(payload.get("mode").asString()).isEqualTo("TOPIC_DUEL");
        assertThat(payload.get("questionCount").asInt()).isEqualTo(10);
        assertThat(payload.get("topic").get("topicId").asString()).isEqualTo(TOPIC_A.toString());
        assertThat(payload.get("topic").get("name").asString()).isEqualTo("Kerala History");
        assertThat(payload.get("topic").get("subjectName").asString()).isEqualTo("History");
        assertThat(payload.get("topic").has("subjectId")).isFalse();
        assertThat(toBiju.get("payload").get("topic")).isEqualTo(payload.get("topic"));
        assertThat(CORE.calls()).singleElement().satisfies(call -> {
            assertThat(call.body().get("source").asString()).isEqualTo("BANK");
            assertThat(call.body().get("filters").get("category").asString()).isEqualTo("KERALA_PSC");
            assertThat(call.body().get("filters").get("topicId").asString()).isEqualTo(TOPIC_A.toString());
            assertThat(call.body().get("count").asInt()).isEqualTo(10);
        });
        // The mode tags the meters; the topic never does (cardinality).
        assertThat(meters.find("minnal.matchmaking.pairings").tag("mode", "TOPIC_DUEL").counters()).isNotEmpty();
        assertThat(meters.getMeters()).allSatisfy(m -> assertThat(m.getId().getTags()).noneMatch(t -> t.getKey().equals("topicId")));
        leaveMatch(anju, toAnju);
        leaveMatch(biju, toBiju);
    }

    @Test
    void playersOnDifferentTopicsOrInQuickMatchAreNeverPairedAndEachGetsABotAt8s() {
        String a = newSub();
        String b = newSub();
        String c = newSub();
        StompTestClient onA = user(a);
        StompTestClient onB = user(b);
        StompTestClient quick = user(c);
        duel(onA, TOPIC_A);
        duel(onB, TOPIC_B);
        quick.join();
        onA.expectNothing(TWO_TICKS);
        onB.expectNothing(TWO_TICKS);
        quick.expectNothing(TWO_TICKS);
        clock.advance(Duration.ofMillis(8000));
        JsonNode foundA = onA.next("MATCH_FOUND");
        JsonNode foundB = onB.next("MATCH_FOUND");
        JsonNode foundQuick = quick.next("MATCH_FOUND");
        for (JsonNode found : List.of(foundA, foundB, foundQuick)) {
            assertThat(found.get("payload").get("participants").get(1).get("kind").asString()).isEqualTo("BOT");
        }
        assertThat(foundA.get("payload").get("topic").get("topicId").asString()).isEqualTo(TOPIC_A.toString());
        assertThat(foundB.get("payload").get("topic").get("topicId").asString()).isEqualTo(TOPIC_B.toString());
        assertThat(foundQuick.get("payload").get("mode").asString()).isEqualTo("QUICK");
        assertThat(foundQuick.get("payload").has("topic")).isFalse();
        leaveMatch(onA, foundA);
        leaveMatch(onB, foundB);
        leaveMatch(quick, foundQuick);
    }

    @Test
    void topicDuelPairsByTheTopicDuelRatingAndWidensAt4s() {
        String a = newSub();
        String b = newSub();
        Instant at = Instant.parse("2026-11-19T10:00:00Z");
        ratings.put(a, 1200);
        ratings.put(b, 1200); // equal Quick ratings must not matter
        ratings.update(a, "TOPIC_DUEL", 1500, at);
        ratings.update(b, "TOPIC_DUEL", 1200, at);
        StompTestClient first = user(a);
        StompTestClient second = user(b);
        duel(first, TOPIC_A);
        duel(second, TOPIC_A);
        first.expectNothing(TWO_TICKS);
        clock.advance(Duration.ofMillis(3900));
        first.expectNothing(TWO_TICKS);
        clock.advance(Duration.ofMillis(100));
        JsonNode found = first.next("MATCH_FOUND");
        JsonNode other = second.next("MATCH_FOUND");
        assertThat(found.get("payload").get("participants").get(1).get("kind").asString()).isEqualTo("USER");
        leaveMatch(first, found);
        leaveMatch(second, other);
    }

    @Test
    void aJoinWithoutAValidTopicIsRejectedAtOnceAndNeverQueuedOrAskedOfCore() {
        String a = newSub();
        StompTestClient anju = user(a);
        anju.send("/app/matchmaking/TOPIC_DUEL/join");
        anju.error("INVALID_TOPIC");
        anju.send("/app/matchmaking/TOPIC_DUEL/join", "{\"topicId\":\"not-a-uuid\"}");
        anju.error("INVALID_TOPIC");
        anju.send("/app/matchmaking/TOPIC_DUEL/join", "{\"topicId\":null}");
        anju.error("INVALID_TOPIC");
        assertThat(participation.activityOf(a)).isEmpty();
        assertThat(CORE.calls()).isEmpty();
        // ...and she is still free to queue properly.
        duel(anju, TOPIC_A);
        org.awaitility.Awaitility.await().until(() -> participation.activityOf(a).isPresent());
        anju.send("/app/matchmaking/TOPIC_DUEL/cancel");
        anju.next("MATCHMAKING_CANCELLED");
        assertThat(participation.activityOf(a)).isEmpty();
    }

    @Test
    void aTopicThatCoreRefusesWith422FailsBothPlayersWithTopicUnavailable() {
        String a = newSub();
        String b = newSub();
        StompTestClient anju = user(a);
        StompTestClient biju = user(b);
        CORE.status = 422;
        duel(anju, TOPIC_A);
        duel(biju, TOPIC_A);
        assertThat(anju.next("MATCHMAKING_FAILED").get("payload").get("reason").asString()).isEqualTo("TOPIC_UNAVAILABLE");
        assertThat(biju.next("MATCHMAKING_FAILED").get("payload").get("reason").asString()).isEqualTo("TOPIC_UNAVAILABLE");
        assertThat(participation.activityOf(a)).isEmpty();
        assertThat(participation.activityOf(b)).isEmpty();
    }

    @Test
    void otherCoreFailuresKeepTheExistingReason() {
        String a = newSub();
        String b = newSub();
        StompTestClient anju = user(a);
        StompTestClient biju = user(b);
        CORE.status = 503;
        duel(anju, TOPIC_A);
        duel(biju, TOPIC_A);
        assertThat(anju.next("MATCHMAKING_FAILED").get("payload").get("reason").asString()).isEqualTo("QUESTION_SET_UNAVAILABLE");
        biju.next("MATCHMAKING_FAILED");
    }

    @Test
    void aMalformedJoinBodyStillQueuesQuickAndGivesInvalidTopicOnTopicDuel() {
        String a = newSub();
        StompTestClient anju = user(a);
        for (String body : List.of("not json", "[1,2]", "\"text\"", "{\"topicId\":", "{\"topicId\":5}")) {
            anju.send("/app/matchmaking/TOPIC_DUEL/join", body);
            anju.error("INVALID_TOPIC");
        }
        assertThat(participation.activityOf(a)).isEmpty();
        anju.send("/app/matchmaking/QUICK/join", "not json");
        org.awaitility.Awaitility.await().until(() -> participation.activityOf(a).isPresent());
        anju.cancel();
        anju.next("MATCHMAKING_CANCELLED");
        anju.send("/app/matchmaking/QUICK/join", "[1,2]");
        org.awaitility.Awaitility.await().until(() -> participation.activityOf(a).isPresent());
        anju.cancel();
        anju.next("MATCHMAKING_CANCELLED");
    }

    @Test
    void aPlayerWhoClosesHerLastSocketWhileQueuedIsReleasedAndNeverPaired() {
        String a = newSub();
        String b = newSub();
        StompTestClient anju = user(a);
        duel(anju, TOPIC_A);
        org.awaitility.Awaitility.await().until(() -> participation.activityOf(a).isPresent());
        anju.close();
        awaitIdle(a);
        assertThat(participation.activityOf(a)).isEmpty();

        StompTestClient biju = user(b);
        duel(biju, TOPIC_A);
        biju.expectNothing(TWO_TICKS);
        assertThat(participation.activityOf(b)).isPresent();
        biju.send("/app/matchmaking/TOPIC_DUEL/cancel");
        biju.next("MATCHMAKING_CANCELLED");
    }

    @Test
    void aGuestIsRejectedFromTopicDuelWhateverTheUiShows() {
        String g = newSub();
        StompTestClient guest = guest(g);
        duel(guest, TOPIC_A);
        guest.error("FORBIDDEN_MODE");
        assertThat(participation.activityOf(g)).isEmpty();
    }

    @Test
    void aQueuedOrBusyPlayerGetsAlreadyInMatchOnTopicDuel() {
        String a = newSub();
        StompTestClient anju = user(a);
        anju.join(); // Quick queue
        org.awaitility.Awaitility.await().until(() -> participation.activityOf(a).isPresent());
        duel(anju, TOPIC_A);
        anju.error("ALREADY_IN_MATCH");
        anju.cancel();
        anju.next("MATCHMAKING_CANCELLED");

        duel(anju, TOPIC_A);
        org.awaitility.Awaitility.await().until(() -> participation.activityOf(a).isPresent());
        anju.join();
        anju.error("ALREADY_IN_MATCH");
        // A cancel names only the mode: the Quick cancel does not touch her Topic Duel queue.
        anju.cancel();
        anju.error("NOT_IN_QUEUE");
        anju.send("/app/matchmaking/TOPIC_DUEL/cancel");
        anju.next("MATCHMAKING_CANCELLED");
    }

    // ----- rematch ------------------------------------------------------------------------------------

    UUID playedTopicMatch(Map<String, StompTestClient> humans, boolean withBot) {
        UUID matchId = UUID.randomUUID();
        Map<String, UUID> bySub = new LinkedHashMap<>();
        List<Participant> participants = new ArrayList<>();
        for (String sub : humans.keySet()) {
            UUID id = UUID.randomUUID();
            bySub.put(sub, id);
            participants.add(new Participant(id, "Player " + sub.substring(0, 4), ParticipantKind.USER));
            participation.claim(sub, new Activity.Queued(MatchMode.TOPIC_DUEL, TOPIC_A));
        }
        if (withBot) {
            participants.add(new Participant(UUID.randomUUID(), "Minnal Bot", ParticipantKind.BOT));
        }
        List<InternalQuestion> questions = IntStream.range(0, 2).mapToObj(i -> new InternalQuestion(UUID.randomUUID(), 1,
                "ചോദ്യം " + i, "Question " + i, List.of("a", "b", "c", "d"), i % 4, "x", null)).toList();
        matches.start(new MatchSetup(matchId, MatchMode.TOPIC_DUEL, participants, bySub, questions, Map.of(), Map.of(),
                Instant.now(), in.minnal.contracts.internal.QuestionSource.BANK,
                new TopicInfo(TOPIC_A, "Old Name", "History"))).orElseThrow();
        for (StompTestClient client : humans.values()) {
            JsonNode ended = RematchFlowTest.privateOf(client, "MATCH_ENDED");
            assertThat(ended.get("payload").get("mode").asString()).isEqualTo("TOPIC_DUEL");
            assertThat(ended.get("payload").get("topic").get("name").asString()).isEqualTo("Old Name");
        }
        awaitIdle(humans.keySet().toArray(String[]::new));
        return matchId;
    }

    @Test
    void aRematchKeepsTheModeAndTheTopicAndFetchesAFreshTopicSet() {
        String a = newSub();
        StompTestClient anju = user(a);
        UUID ended = playedTopicMatch(Map.of(a, anju), true);
        anju.send(RematchFlowTest.rematch(ended));
        JsonNode found = anju.next("MATCH_FOUND");
        JsonNode payload = found.get("payload");
        assertThat(payload.get("mode").asString()).isEqualTo("TOPIC_DUEL");
        assertThat(payload.get("topic").get("topicId").asString()).isEqualTo(TOPIC_A.toString());
        assertThat(payload.get("topic").get("name").asString()).isEqualTo("Kerala History"); // the fresh fetch
        assertThat(CORE.calls().getLast().body().get("filters").get("topicId").asString()).isEqualTo(TOPIC_A.toString());
        leaveMatch(anju, found);
    }

    @Test
    void aRematchWhoseTopicIsNowTooSmallFailsWithTopicUnavailable() {
        String a = newSub();
        String b = newSub();
        StompTestClient anju = user(a);
        StompTestClient biju = user(b);
        UUID ended = playedTopicMatch(new LinkedHashMap<>(Map.of(a, anju, b, biju)), false);
        CORE.status = 422;
        anju.send(RematchFlowTest.rematch(ended));
        anju.next("REMATCH_REQUESTED");
        biju.next("REMATCH_REQUESTED");
        biju.send(RematchFlowTest.rematch(ended));
        assertThat(anju.next("MATCHMAKING_FAILED").get("payload").get("reason").asString()).isEqualTo("TOPIC_UNAVAILABLE");
        assertThat(biju.next("MATCHMAKING_FAILED").get("payload").get("reason").asString()).isEqualTo("TOPIC_UNAVAILABLE");
    }

    @Test
    void aGuestRematchingIntoATopicDuelIsRejected() {
        String a = newSub();
        String g = newSub();
        StompTestClient anju = user(a);
        StompTestClient guest = guest(g);
        UUID ended = playedTopicMatch(Map.of(a, anju), true);
        guest.send(RematchFlowTest.rematch(ended));
        guest.error("FORBIDDEN_MODE");
    }
}
