package in.minnal.game.match;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.Destinations;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.RecordingMatchCompletedPublisher;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Story 1.10 between real STOMP clients: the private {@code MATCH_ENDED} at the end of a completed
 * match and exactly one {@code minnal.match.completed}, recorded by the test publisher. The window is
 * 3 s (as in {@link MatchEarlyCloseFlowTest}), so questions close as soon as everyone has answered.
 * Question {@code i} has answer index {@code i % 4}; the test clock stands still, so a right answer
 * scores 600.
 */
@TestPropertySource(properties = "minnal.match.window=3s")
class MatchEndFlowTest extends GameIntegrationTest {

    @Autowired
    MatchRegistry matches;

    @Autowired
    RecordingMatchCompletedPublisher published;

    final List<StompTestClient> clients = new ArrayList<>();
    final List<String> subs = new ArrayList<>();

    @AfterEach
    void leaveEverything() {
        clients.forEach(StompTestClient::close);
        awaitIdle(subs.toArray(String[]::new));
    }

    StompTestClient client(String sub) {
        StompTestClient client = connect(guestToken(sub));
        clients.add(client);
        return client;
    }

    record Started(UUID matchId, List<UUID> ids) {
    }

    Started start(List<String> humans, boolean withBot, Map<String, Long> waits) {
        UUID matchId = UUID.randomUUID();
        Map<String, UUID> bySub = new LinkedHashMap<>();
        List<Participant> participants = new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        for (String sub : humans) {
            UUID id = UUID.randomUUID();
            bySub.put(sub, id);
            ids.add(id);
            participants.add(new Participant(id, "Guest " + sub.substring(0, 4), ParticipantKind.GUEST));
            participation.claim(sub, new Activity.Queued(MatchMode.QUICK));
            subs.add(sub);
        }
        if (withBot) {
            UUID bot = UUID.randomUUID();
            ids.add(bot);
            participants.add(new Participant(bot, "Minnal Bot", ParticipantKind.BOT));
        }
        List<InternalQuestion> questions = IntStream.range(0, 10).mapToObj(i -> new InternalQuestion(UUID.randomUUID(), 1,
                "ചോദ്യം " + i, "Question " + i, List.of("a", "b", "c", "d"), i % 4, "x" + i, i == 0 ? "PSC 2019" : null))
                .toList();
        matches.start(new MatchSetup(matchId, MatchMode.QUICK, participants, bySub, questions, waits, Map.of(),
                Instant.now())).orElseThrow();
        return new Started(matchId, ids);
    }

    static String to(UUID matchId, String action) {
        return "/app/match/" + matchId + "/" + action;
    }

    static String body(int questionIndex, int optionIndex) {
        return "{\"questionIndex\":" + questionIndex + ",\"optionIndex\":" + optionIndex + "}";
    }

    static JsonNode participant(JsonNode payload, UUID id) {
        for (JsonNode p : payload.get("participants")) {
            if (p.get("participantId").asString().equals(id.toString())) {
                return p;
            }
        }
        throw new AssertionError("no participant " + id);
    }

    /** The next topic frame of {@code type}, skipping others (scoreboards, for one). */
    static JsonNode topicOf(StompTestClient client, String type) {
        for (int i = 0; i < 20; i++) {
            JsonNode frame = client.nextBroadcast(Duration.ofSeconds(5));
            if (frame.get("type").asString().equals(type)) {
                return frame;
            }
        }
        throw new AssertionError("no " + type);
    }

    /** The next private message of {@code type}, skipping others (answer acks, for one). */
    static JsonNode privateOf(StompTestClient client, String type) {
        for (int i = 0; i < 30; i++) {
            JsonNode message = client.next(Duration.ofSeconds(5));
            if (message.get("type").asString().equals(type)) {
                return message;
            }
        }
        throw new AssertionError("no " + type);
    }

    MatchCompletedEvent onlyEventOf(UUID matchId) {
        await().atMost(Duration.ofSeconds(2)).until(() -> !published.of(matchId).isEmpty());
        assertThat(published.of(matchId)).hasSize(1);
        return published.of(matchId).getFirst();
    }

    @Test
    void theWinnerAndTheLoserBothGetMatchEndedAndOneEventIsPublished() {
        String anjuSub = newSub();
        String vishnuSub = newSub();
        StompTestClient anju = client(anjuSub);
        StompTestClient vishnu = client(vishnuSub);
        Started match = start(List.of(anjuSub, vishnuSub), false, Map.of(anjuSub, 1_200L, vishnuSub, 3_400L));
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        vishnu.subscribe(Destinations.matchTopic(match.matchId()));
        for (int q = 0; q < 10; q++) {
            topicOf(anju, "QUESTION_STARTED");
            topicOf(vishnu, "QUESTION_STARTED");
            anju.send(to(match.matchId(), "answer"), body(q, q % 4));
            vishnu.send(to(match.matchId(), "answer"), body(q, (q + 1) % 4));
            topicOf(anju, "QUESTION_REVEALED");
            topicOf(vishnu, "QUESTION_REVEALED");
        }

        JsonNode ended = privateOf(anju, "MATCH_ENDED");
        assertThat(ended.has("seq")).as("private").isFalse();
        assertThat(ended.get("matchId").asString()).isEqualTo(match.matchId().toString());
        JsonNode payload = ended.get("payload");
        assertThat(privateOf(vishnu, "MATCH_ENDED").get("payload")).isEqualTo(payload);
        assertThat(payload.get("mode").asString()).isEqualTo("QUICK");
        assertThat(payload.get("questionSource").asString()).isEqualTo("BANK");
        assertThat(payload.get("questions")).hasSize(10);
        JsonNode first = payload.get("questions").get(0);
        assertThat(first.get("answerIndex").asInt()).isZero();
        assertThat(first.get("attribution").asString()).isEqualTo("PSC 2019");
        assertThat(payload.get("questions").get(1).has("attribution")).isFalse();
        JsonNode winner = participant(payload, match.ids().get(0));
        JsonNode loser = participant(payload, match.ids().get(1));
        assertThat(winner.get("score").asInt()).isEqualTo(6_000);
        assertThat(winner.get("correctCount").asInt()).isEqualTo(10);
        assertThat(winner.get("placement").asInt()).isEqualTo(1);
        assertThat(loser.get("score").asInt()).isZero();
        assertThat(loser.get("placement").asInt()).isEqualTo(2);
        JsonNode breakdown = payload.get("breakdown").get(1).get("answers").get(3);
        assertThat(breakdown.get("pickedIndex").asInt()).isEqualTo(0);
        assertThat(breakdown.get("correct").asBoolean()).isFalse();
        assertThat(breakdown.get("points").asInt()).isZero();
        assertThat(breakdown.has("responseMs")).isTrue();

        MatchCompletedEvent event = onlyEventOf(match.matchId());
        assertThat(event.rated()).isTrue();
        assertThat(event.queueWaitMs()).isEqualTo(3_400L);
        assertThat(event.participants()).extracting(CompletedParticipant::placement).containsExactly(1, 2);
        assertThat(event.participants()).extracting(CompletedParticipant::userId).containsOnlyNulls();
        assertThat(event.participants()).extracting(CompletedParticipant::kind)
                .containsOnly(ParticipantKind.GUEST);
    }

    @Test
    void aOneVsOneForfeiterStillConnectedGetsMatchEndedAtOnceAndPlacesLastWhateverHerScore() {
        String anjuSub = newSub();
        String vishnuSub = newSub();
        StompTestClient anju = client(anjuSub);
        StompTestClient vishnu = client(vishnuSub);
        Started match = start(List.of(anjuSub, vishnuSub), false, Map.of());
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        vishnu.subscribe(Destinations.matchTopic(match.matchId()));
        for (int q = 0; q < 2; q++) {
            topicOf(anju, "QUESTION_STARTED");
            topicOf(vishnu, "QUESTION_STARTED");
            anju.send(to(match.matchId(), "answer"), body(q, q % 4));
            vishnu.send(to(match.matchId(), "answer"), body(q, (q + 1) % 4));
            topicOf(vishnu, "QUESTION_REVEALED");
        }
        topicOf(vishnu, "QUESTION_STARTED"); // Q3
        anju.send(to(match.matchId(), "leave"));
        topicOf(vishnu, "PARTICIPANT_FORFEITED");
        topicOf(vishnu, "QUESTION_REVEALED"); // Q3 closed at once; the match ends

        JsonNode payload = privateOf(anju, "MATCH_ENDED").get("payload");
        JsonNode her = participant(payload, match.ids().get(0));
        JsonNode him = participant(payload, match.ids().get(1));
        assertThat(her.get("forfeited").asBoolean()).isTrue();
        assertThat(her.get("correctCount").asInt()).isEqualTo(2);
        assertThat(her.get("score").asInt()).isEqualTo(1_200);
        assertThat(her.get("placement").asInt()).as("a 1v1 forfeiter places last whatever her score").isEqualTo(2);
        assertThat(him.get("correctCount").asInt()).isZero();
        assertThat(him.get("placement").asInt()).isEqualTo(1);
        assertThat(payload.get("questions")).as("only the asked questions").hasSize(3);
        assertThat(payload.get("breakdown").get(0).get("answers").get(2).has("pickedIndex")).isFalse();
        assertThat(privateOf(vishnu, "MATCH_ENDED").get("payload")).isEqualTo(payload);

        MatchCompletedEvent event = onlyEventOf(match.matchId());
        assertThat(event.participants()).extracting(CompletedParticipant::forfeited).containsExactly(true, false);
    }

    @Test
    void whenTheOnlyHumanLeavesAtQ5TheResultsHoldQ1ToQ5AndTheEventIsPublished() {
        String anjuSub = newSub();
        StompTestClient anju = client(anjuSub);
        Started match = start(List.of(anjuSub), true, Map.of(anjuSub, 8_000L));
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        for (int q = 0; q < 4; q++) {
            topicOf(anju, "QUESTION_STARTED");
            anju.send(to(match.matchId(), "answer"), body(q, q % 4));
            topicOf(anju, "QUESTION_REVEALED");
        }
        topicOf(anju, "QUESTION_STARTED"); // Q5
        anju.send(to(match.matchId(), "leave"));

        JsonNode payload = privateOf(anju, "MATCH_ENDED").get("payload");
        assertThat(payload.get("questions")).as("only the asked questions").hasSize(5);
        assertThat(payload.get("breakdown")).hasSize(2)
                .allSatisfy(b -> assertThat(b.get("answers")).hasSize(5));
        JsonNode her = participant(payload, match.ids().get(0));
        assertThat(her.get("forfeited").asBoolean()).isTrue();
        assertThat(her.get("correctCount").asInt()).isEqualTo(4);
        assertThat(participant(payload, match.ids().get(1)).get("kind").asString()).isEqualTo("BOT");

        MatchCompletedEvent event = onlyEventOf(match.matchId());
        assertThat(event.queueWaitMs()).isEqualTo(8_000L);
        assertThat(event.participants()).extracting(CompletedParticipant::kind)
                .containsExactly(ParticipantKind.GUEST, ParticipantKind.BOT);
    }

    @Test
    void anAbortedMatchSendsNoMatchEndedAndPublishesNothing() {
        String anjuSub = newSub();
        StompTestClient anju = client(anjuSub);
        Started match = start(List.of(anjuSub), true, Map.of());
        anju.subscribe(Destinations.matchTopic(match.matchId()));
        topicOf(anju, "QUESTION_STARTED");
        anju.send(to(match.matchId(), "leave"));
        topicOf(anju, "MATCH_ABORTED");
        awaitIdle(anjuSub);
        anju.expectNothing(Duration.ofMillis(300));
        assertThat(published.of(match.matchId())).isEmpty();
    }
}
