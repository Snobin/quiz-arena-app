package in.minnal.game.match;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.Destinations;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Story 1.11 between real STOMP clients: early close and the 1v1 ack. The window is 3 s here (not
 * the 200 ms of {@code application-test.yaml}), so a reveal that arrives well inside it can only be
 * an early close. The test clock stands still, so every answer lands with the whole 3 s left: 600
 * points when right. The fake core's question {@code i} has answer index {@code i % 4}.
 */
@TestPropertySource(properties = "minnal.match.window=3s")
class MatchEarlyCloseFlowTest extends GameIntegrationTest {

    static final Duration EARLY = Duration.ofMillis(1_500);
    static final int POINTS = 600;

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
        clients.forEach(StompTestClient::close);
        awaitIdle(subs.toArray(String[]::new));
    }

    StompTestClient guest(String sub) {
        subs.add(sub);
        StompTestClient client = connect(guestToken(sub));
        clients.add(client);
        return client;
    }

    static String answer(String matchId) {
        return "/app/match/" + matchId + "/answer";
    }

    static String body(int questionIndex, int optionIndex) {
        return "{\"questionIndex\":" + questionIndex + ",\"optionIndex\":" + optionIndex + "}";
    }

    /** Fails if {@code frame} carries any pick, correctness, points or answer. */
    static void assertNoResultIn(JsonNode frame) {
        assertThat(frame.toString()).as("frame %s", frame)
                .doesNotContain("pickedIndex").doesNotContain("correct").doesNotContain("points")
                .doesNotContain("answerIndex").doesNotContain("totalScore").doesNotContain("explanation");
    }

    @Test
    void aQuickMatchClosesEachQuestionOnceBothAnsweredAndTheOpponentLearnsNothingBeforeTheReveal() {
        StompTestClient anju = guest(newSub());
        StompTestClient vishnu = guest(newSub());
        anju.join();
        vishnu.join();
        JsonNode found = anju.next("MATCH_FOUND");
        JsonNode other = vishnu.next("MATCH_FOUND");
        String matchId = found.get("matchId").asString();
        String anjuId = found.get("payload").get("selfParticipantId").asString();
        String vishnuId = other.get("payload").get("selfParticipantId").asString();
        anju.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        vishnu.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));

        long matchStarted = 0;
        int anjuTotal = 0;
        for (int q = 0; q < 10; q++) {
            int right = q % 4;
            anju.nextBroadcast("QUESTION_STARTED");
            vishnu.nextBroadcast("QUESTION_STARTED");
            long opened = System.nanoTime();
            if (q == 0) {
                matchStarted = opened;
            }

            anju.send(answer(matchId), body(q, right));
            JsonNode ack = anju.next("ANSWER_ACCEPTED");
            assertThat(ack.get("payload").propertyNames())
                    .containsExactly("questionIndex", "correct", "points", "answerIndex", "totalScore");
            anjuTotal += POINTS;
            assertThat(ack.get("payload").get("correct").asBoolean()).isTrue();
            assertThat(ack.get("payload").get("points").asInt()).isEqualTo(POINTS);
            assertThat(ack.get("payload").get("answerIndex").asInt()).isEqualTo(right);
            assertThat(ack.get("payload").get("totalScore").asInt()).isEqualTo(anjuTotal);
            anju.nextBroadcast("SCOREBOARD");

            // Vishnu has not answered: he sees only that Anju answered, never what or whether right.
            JsonNode scoreboard = vishnu.nextBroadcast("SCOREBOARD");
            assertThat(scoreboard.get("payload").get("answered")).extracting(JsonNode::asString)
                    .containsExactly(anjuId);
            assertNoResultIn(scoreboard);
            vishnu.expectNothing(Duration.ofMillis(100));
            assertThat(vishnu.pendingBroadcasts()).as("no reveal while Vishnu is still to answer").isZero();

            vishnu.send(answer(matchId), body(q, (right + 1) % 4));
            JsonNode vishnuAck = vishnu.next("ANSWER_ACCEPTED").get("payload");
            assertThat(vishnuAck.get("correct").asBoolean()).isFalse();
            assertThat(vishnuAck.get("points").asInt()).isZero();
            assertThat(vishnuAck.get("answerIndex").asInt()).isEqualTo(right);
            assertThat(vishnuAck.get("totalScore").asInt()).isZero();
            assertNoResultIn(anju.nextBroadcast("SCOREBOARD"));
            vishnu.nextBroadcast("SCOREBOARD");

            JsonNode revealed = anju.nextBroadcast("QUESTION_REVEALED");
            assertThat(vishnu.nextBroadcast("QUESTION_REVEALED")).isEqualTo(revealed);
            assertThat(Duration.ofNanos(System.nanoTime() - opened)).as("Q%d closed early", q).isLessThan(EARLY);
            JsonNode anjuResult = resultOf(revealed.get("payload"), anjuId);
            assertThat(anjuResult.get("points").asInt()).as("early close keeps the points").isEqualTo(POINTS);
            assertThat(anjuResult.get("totalScore").asInt()).isEqualTo(anjuTotal);
            assertThat(resultOf(revealed.get("payload"), vishnuId).get("pickedIndex").asInt())
                    .isEqualTo((right + 1) % 4);
        }
        // Ten timed windows would take 30 s; closing early takes a fraction of that.
        assertThat(Duration.ofNanos(System.nanoTime() - matchStarted)).isLessThan(Duration.ofSeconds(10));
        awaitIdle(subs.toArray(String[]::new));
    }

    @Test
    void aBattleRoomAckIsAReceiptOnlyButTheRoomStillClosesEarly() {
        String firstSub = newSub();
        String secondSub = newSub();
        StompTestClient first = guest(firstSub);
        StompTestClient second = guest(secondSub);
        UUID matchId = UUID.randomUUID();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        Map<String, UUID> humans = new LinkedHashMap<>();
        humans.put(firstSub, firstId);
        humans.put(secondSub, secondId);
        for (String sub : humans.keySet()) {
            participation.claim(sub, new Activity.Queued(MatchMode.BATTLE_ROOM));
        }
        InternalQuestion question = new InternalQuestion(UUID.randomUUID(), 1, "ചോദ്യം", "Question",
                List.of("a", "b", "c", "d"), 2, "x", null);
        matches.start(new MatchSetup(matchId, MatchMode.BATTLE_ROOM,
                List.of(new Participant(firstId, "Anju", ParticipantKind.GUEST),
                        new Participant(secondId, "Vishnu", ParticipantKind.GUEST)),
                humans, List.of(question), Map.of(), Map.of(), Instant.now())).orElseThrow();
        first.subscribe(Destinations.matchTopic(matchId));
        second.subscribe(Destinations.matchTopic(matchId));

        first.nextBroadcast("QUESTION_STARTED");
        second.nextBroadcast("QUESTION_STARTED");
        long opened = System.nanoTime();
        first.send(answer(matchId.toString()), body(0, 2));
        JsonNode ack = first.next("ANSWER_ACCEPTED");
        assertThat(ack.get("payload").propertyNames()).containsExactly("questionIndex");
        assertThat(ack.get("payload").get("questionIndex").asInt()).isZero();
        assertNoResultIn(second.nextBroadcast("SCOREBOARD"));
        second.send(answer(matchId.toString()), body(0, 1));
        assertThat(second.next("ANSWER_ACCEPTED").get("payload").propertyNames()).containsExactly("questionIndex");
        JsonNode revealed = second.nextBroadcast(Duration.ofSeconds(5));
        while (!revealed.get("type").asString().equals("QUESTION_REVEALED")) {
            revealed = second.nextBroadcast(Duration.ofSeconds(5));
        }
        assertThat(Duration.ofNanos(System.nanoTime() - opened)).as("the room closed early").isLessThan(EARLY);
        assertThat(revealed.get("payload").get("answerIndex").asInt()).isEqualTo(2);
    }

    static JsonNode resultOf(JsonNode reveal, String participantId) {
        for (JsonNode result : reveal.get("results")) {
            if (result.get("participantId").asString().equals(participantId)) {
                return result;
            }
        }
        throw new AssertionError("no result for " + participantId + " in " + reveal);
    }
}
