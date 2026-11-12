package in.minnal.game.match;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.RawStomp;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

/**
 * Whole matches between real STOMP clients (Story 1.7 matrix), on the shortened test timeline of
 * {@code application-test.yaml}: 500 ms lead-in, 200 ms windows, 30 ms holds. The fake core's
 * question {@code i} has answer index {@code i % 4}.
 */
class MatchFlowTest extends GameIntegrationTest {

    static final Duration WAIT = Duration.ofSeconds(5);

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

    record Pair(StompTestClient first, StompTestClient second, String matchId, String firstId, String secondId) {
    }

    static JsonNode resultOf(JsonNode reveal, String participantId) {
        for (JsonNode result : reveal.get("results")) {
            if (result.get("participantId").asString().equals(participantId)) {
                return result;
            }
        }
        throw new AssertionError("no result for " + participantId + " in " + reveal);
    }

    /** Two guests paired, both subscribed to the match topic within the lead-in. */
    Pair pair() {
        StompTestClient first = guest(newSub());
        StompTestClient second = guest(newSub());
        first.join();
        second.join();
        JsonNode found = first.next("MATCH_FOUND");
        JsonNode other = second.next("MATCH_FOUND");
        String matchId = found.get("matchId").asString();
        first.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        second.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        return new Pair(first, second, matchId, found.get("payload").get("selfParticipantId").asString(),
                other.get("payload").get("selfParticipantId").asString());
    }

    @Test
    void twoClientsPlayAWholeMatchThenAreFreeToJoinAgain() {
        Pair pair = pair();
        StompTestClient anju = pair.first();
        StompTestClient vishnu = pair.second();
        String matchId = pair.matchId();
        String anjuId = pair.firstId();
        String vishnuId = pair.secondId();

        long seq = 0;
        int anjuTotal = 0;
        for (int q = 0; q < 10; q++) {
            int right = q % 4;
            JsonNode started = anju.nextBroadcast("QUESTION_STARTED");
            assertThat(vishnu.nextBroadcast("QUESTION_STARTED")).isEqualTo(started);
            assertThat(started.get("seq").asLong()).isEqualTo(++seq);
            assertThat(started.get("matchId").asString()).isEqualTo(matchId);
            JsonNode payload = started.get("payload");
            assertThat(payload.get("questionIndex").asInt()).isEqualTo(q);
            assertThat(payload.get("total").asInt()).isEqualTo(10);
            assertThat(payload.get("question").propertyNames())
                    .containsExactly("questionId", "version", "textMl", "textEn", "options");
            assertThat(started.toString()).doesNotContain("answerIndex").doesNotContain("explanation");

            anju.send(answer(matchId), body(q, right));
            JsonNode ack = anju.next("ANSWER_ACCEPTED");
            assertThat(ack.get("payload").get("questionIndex").asInt()).isEqualTo(q);
            assertThat(ack.get("refSeq").asLong()).isEqualTo(seq);
            assertThat(ack.has("seq")).isFalse();
            // Quick Match is 1v1: her own result rides on the ack (Story 1.11).
            assertThat(ack.get("payload").get("correct").asBoolean()).isTrue();
            assertThat(ack.get("payload").get("points").asInt()).isEqualTo(507);
            assertThat(ack.get("payload").get("answerIndex").asInt()).isEqualTo(right);
            assertThat(ack.get("payload").get("totalScore").asInt()).isEqualTo(anjuTotal + 507);
            JsonNode scoreboard = anju.nextBroadcast("SCOREBOARD");
            assertThat(scoreboard.get("seq").asLong()).isEqualTo(++seq);
            assertThat(scoreboard.get("payload").get("answered")).extracting(JsonNode::asString).containsExactly(anjuId);
            assertThat(vishnu.nextBroadcast("SCOREBOARD")).isEqualTo(scoreboard);

            if (q == 0) {
                // Rejections go only to the sender, with the last broadcast seq.
                vishnu.send(answer(matchId), body(0, 5));
                assertThat(vishnu.error("ANSWER_REJECTED").get("refSeq").asLong()).isEqualTo(seq);
                vishnu.send(answer(matchId), body(1, 0));
                vishnu.error("ANSWER_REJECTED");
                vishnu.send(answer(matchId), "{\"optionIndex\":1}");
                vishnu.error("ANSWER_REJECTED");
                // A second answer from Anju is dropped silently.
                anju.send(answer(matchId), body(0, (right + 1) % 4));
            }
            if (q % 2 == 0) {
                vishnu.send(answer(matchId), body(q, (right + 1) % 4)); // wrong
                JsonNode vishnuAck = vishnu.next("ANSWER_ACCEPTED").get("payload");
                assertThat(vishnuAck.get("correct").asBoolean()).isFalse();
                assertThat(vishnuAck.get("points").asInt()).isZero();
                assertThat(vishnuAck.get("answerIndex").asInt()).isEqualTo(right);
                // Both answered: the question closes at once (early close).
                assertThat(anju.nextBroadcast("SCOREBOARD").get("payload").get("answered"))
                        .extracting(JsonNode::asString).containsExactly(anjuId, vishnuId);
                vishnu.nextBroadcast("SCOREBOARD");
                seq++;
            }

            JsonNode revealed = anju.nextBroadcast("QUESTION_REVEALED");
            assertThat(vishnu.nextBroadcast("QUESTION_REVEALED")).isEqualTo(revealed);
            assertThat(revealed.get("seq").asLong()).isEqualTo(++seq);
            JsonNode reveal = revealed.get("payload");
            assertThat(reveal.get("questionIndex").asInt()).isEqualTo(q);
            assertThat(reveal.get("answerIndex").asInt()).isEqualTo(right);
            assertThat(reveal.get("explanation").asString()).isEqualTo("x");
            assertThat(reveal.has("attribution")).as("a null attribution is omitted").isFalse();
            assertThat(reveal.get("results")).hasSize(2);
            JsonNode anjuResult = resultOf(reveal, anjuId);
            JsonNode vishnuResult = resultOf(reveal, vishnuId);
            assertThat(anjuResult.get("participantId").asString()).isEqualTo(anjuId);
            assertThat(anjuResult.get("correct").asBoolean()).isTrue();
            assertThat(anjuResult.get("pickedIndex").asInt()).isEqualTo(right);
            // The test clock stands still, so every answer lands with the whole 200 ms left: 507 points.
            assertThat(anjuResult.get("points").asInt()).isEqualTo(507);
            anjuTotal += 507;
            assertThat(anjuResult.get("totalScore").asInt()).isEqualTo(anjuTotal);
            assertThat(vishnuResult.get("correct").asBoolean()).isFalse();
            assertThat(vishnuResult.get("points").asInt()).isZero();
            assertThat(vishnuResult.has("pickedIndex")).isEqualTo(q % 2 == 0);

            if (q == 1) {
                // Vishnu sat Q1 out; once it is revealed, his late answer to it is rejected.
                vishnu.send(answer(matchId), body(1, 0));
                vishnu.error("ANSWER_REJECTED");
            }
        }
        assertThat(seq).isEqualTo(10 + 10 + 10 + 5);
        anju.expectNothing(Duration.ofMillis(300));
        assertThat(anju.pendingBroadcasts()).as("nothing after the 10th reveal").isZero();

        // Ended: both are released and may queue again.
        awaitIdle(subs.toArray(String[]::new));
        assertThat(matches.find(UUID.fromString(matchId))).isEmpty();
        anju.join();
        anju.cancel();
        anju.next("MATCHMAKING_CANCELLED");
        // A late answer to the ended match is ANSWER_REJECTED for its players (NOT_IN_MATCH for others).
        anju.send(answer(matchId), body(9, 0));
        assertThat(anju.error("ANSWER_REJECTED").get("refSeq").asLong()).isEqualTo(seq);
        StompTestClient outsider = guest(newSub());
        outsider.send(answer(matchId), body(9, 0));
        outsider.error("NOT_IN_MATCH");
        // A body that is not JSON is a bad request, to that session only.
        anju.send(answer(matchId), "not json");
        anju.error("BAD_REQUEST");
        vishnu.expectNothing(Duration.ofMillis(200));
    }

    @Test
    void outsidersCannotAnswerOrSubscribe() throws Exception {
        Pair pair = pair();
        String stranger = newSub();
        StompTestClient outsider = guest(stranger);
        outsider.send(answer(pair.matchId()), body(0, 0));
        JsonNode error = outsider.error("NOT_IN_MATCH");
        assertThat(error.get("matchId").asString()).isEqualTo(pair.matchId());
        outsider.send(answer(UUID.randomUUID().toString()), body(0, 0));
        outsider.error("NOT_IN_MATCH");
        outsider.send(answer("garbage"), body(0, 0));
        outsider.error("NOT_IN_MATCH");

        String topic = "destination:" + Destinations.matchTopic(UUID.fromString(pair.matchId()));
        // A stranger's subscription to the match topic is refused (ERROR, socket closed).
        try (RawStomp raw = RawStomp.open(port)) {
            raw.connect("Bearer " + guestToken(stranger));
            assertThat(raw.nextFrame(WAIT)).startsWith("CONNECTED\n");
            raw.send("SUBSCRIBE", "id:0", topic);
            assertThat(raw.nextFrame(WAIT)).startsWith("ERROR\n");
            assertThat(raw.awaitClosed(WAIT)).isTrue();
        }
        // Any other topic, even for a participant: refused.
        String participantSub = subs.get(0); // the first of the pair
        for (String other : List.of("/topic/room/" + UUID.randomUUID(), "/topic/match/" + UUID.randomUUID(), "/topic/anything")) {
            try (RawStomp raw = RawStomp.open(port)) {
                raw.connect("Bearer " + guestToken(participantSub));
                assertThat(raw.nextFrame(WAIT)).startsWith("CONNECTED\n");
                raw.send("SUBSCRIBE", "id:0", "destination:" + other);
                assertThat(raw.nextFrame(WAIT)).as(other).startsWith("ERROR\n");
            }
        }
        // The participant herself, on a second connection: allowed, and broadcasts arrive.
        try (RawStomp raw = RawStomp.open(port)) {
            raw.connect("Bearer " + guestToken(participantSub));
            assertThat(raw.nextFrame(WAIT)).startsWith("CONNECTED\n");
            raw.send("SUBSCRIBE", "id:0", topic);
            String frame = raw.nextFrame(WAIT);
            assertThat(frame).startsWith("MESSAGE\n").contains("\"type\":\"QUESTION_");
        }
    }

    @Test
    void aFloodIsCutToTheRateAndOtherSessionsAreUnaffected() {
        StompTestClient flooder = guest(newSub());
        StompTestClient bystander = guest(newSub());
        for (int i = 0; i < 25; i++) {
            flooder.cancel();
        }
        int processed = 0;
        int limited = 0;
        while (true) {
            JsonNode message;
            try {
                message = flooder.next(Duration.ofMillis(700));
            } catch (AssertionError none) {
                break;
            }
            String code = message.get("payload").get("code").asString();
            if (code.equals("RATE_LIMITED")) {
                limited++;
            } else {
                assertThat(code).isEqualTo("NOT_IN_QUEUE");
                processed++;
            }
        }
        // 10 tokens, one already spent on the private-queue SUBSCRIBE.
        assertThat(processed).isBetween(8, 12);
        assertThat(limited).isEqualTo(1);
        assertThat(flooder.isConnected()).isTrue();
        bystander.cancel();
        bystander.error("NOT_IN_QUEUE");
        // A second later the bucket has refilled.
        flooder.cancel();
        flooder.error("NOT_IN_QUEUE");
    }

    @Test
    void aShortQuestionSetFailsBothPlayers() {
        CORE.shortBy = 1;
        StompTestClient first = guest(newSub());
        StompTestClient second = guest(newSub());
        first.join();
        second.join();
        assertThat(first.next("MATCHMAKING_FAILED").get("payload").get("reason").asString())
                .isEqualTo("QUESTION_SET_UNAVAILABLE");
        second.next("MATCHMAKING_FAILED");
        assertThat(CORE.calls()).hasSize(1);
        awaitIdle(subs.toArray(String[]::new));
    }

    @Test
    void aGuestPlaysMinnalBotWhoAnswersLikeAnyone() {
        StompTestClient anju = guest(newSub());
        anju.join();
        anju.expectNothing(Duration.ofMillis(600));
        clock.advance(Duration.ofSeconds(8));
        JsonNode found = anju.next("MATCH_FOUND");
        String botId = found.get("payload").get("participants").get(1).get("participantId").asString();
        anju.subscribe(Destinations.matchTopic(UUID.fromString(found.get("matchId").asString())));
        int reveals = 0;
        int botAnswered = 0;
        while (reveals < 10) {
            JsonNode message = anju.nextBroadcast(WAIT);
            switch (message.get("type").asString()) {
                case "SCOREBOARD" -> assertThat(message.get("payload").get("answered"))
                        .extracting(JsonNode::asString).containsExactly(botId);
                case "QUESTION_REVEALED" -> {
                    reveals++;
                    JsonNode bot = message.get("payload").get("results").get(1);
                    assertThat(bot.get("participantId").asString()).isEqualTo(botId);
                    if (bot.has("pickedIndex")) {
                        botAnswered++;
                        assertThat(bot.get("points").asInt()).isEqualTo(bot.get("correct").asBoolean() ? 507 : 0);
                    }
                }
                default -> assertThat(message.get("type").asString()).isEqualTo("QUESTION_STARTED");
            }
        }
        assertThat(botAnswered).isPositive();
    }
}
