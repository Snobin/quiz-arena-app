package in.minnal.game.match;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.internal.InternalQuestion;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.Participant;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.contracts.realtime.TopicInfo;
import in.minnal.contracts.realtime.Destinations;
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
 * A Topic Duel that ends by a forfeit (the player leaves, or her connection drops and the grace runs out) still ends as a
 * Topic Duel (Epic 4 retro action): {@code MATCH_ENDED} carries the mode and the topic, every {@code ResultQuestion.topicId}
 * is that topic, the opponent wins at once and exactly one completed event is published for the match. The match is started
 * straight through {@link MatchRegistry#start} so the cast is fixed.
 */
@TestPropertySource(properties = {"minnal.match.window=3s", "minnal.match.grace=1s"})
class TopicDuelForfeitFlowTest extends GameIntegrationTest {

    static final UUID TOPIC = UUID.randomUUID();

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

    record Duel(UUID matchId, UUID anjuId, UUID vishnuId, StompTestClient anju, StompTestClient vishnu, String anjuSub) {
    }

    Duel startDuel() {
        String anjuSub = newSub();
        String vishnuSub = newSub();
        subs.addAll(List.of(anjuSub, vishnuSub));
        StompTestClient anju = connect(userToken(anjuSub, "Anju"));
        StompTestClient vishnu = connect(userToken(vishnuSub, "Vishnu"));
        clients.addAll(List.of(anju, vishnu));
        UUID matchId = UUID.randomUUID();
        UUID anjuId = UUID.randomUUID();
        UUID vishnuId = UUID.randomUUID();
        Map<String, UUID> humans = new LinkedHashMap<>();
        humans.put(anjuSub, anjuId);
        humans.put(vishnuSub, vishnuId);
        humans.keySet().forEach(sub -> participation.claim(sub, new Activity.Queued(MatchMode.TOPIC_DUEL, TOPIC)));
        List<Participant> participants = List.of(new Participant(anjuId, "Anju", ParticipantKind.USER),
                new Participant(vishnuId, "Vishnu", ParticipantKind.USER));
        List<InternalQuestion> questions = IntStream.range(0, 10).mapToObj(i -> new InternalQuestion(UUID.randomUUID(), 1,
                "ചോദ്യം " + i, "Question " + i, List.of("a", "b", "c", "d"), i % 4, "x" + i, null, TOPIC)).toList();
        matches.start(new MatchSetup(matchId, MatchMode.TOPIC_DUEL, participants, humans, questions, Map.of(), Map.of(),
                Instant.now(), in.minnal.contracts.internal.QuestionSource.BANK, new TopicInfo(TOPIC, "Kerala History", "History")))
                .orElseThrow();
        anju.subscribe(Destinations.matchTopic(matchId));
        vishnu.subscribe(Destinations.matchTopic(matchId));
        anju.nextBroadcast("QUESTION_STARTED");
        vishnu.nextBroadcast("QUESTION_STARTED");
        return new Duel(matchId, anjuId, vishnuId, anju, vishnu, anjuSub);
    }

    void assertEndedAsATopicDuelWonByVishnu(Duel duel) {
        JsonNode forfeited = nextOf(duel.vishnu(), "PARTICIPANT_FORFEITED");
        assertThat(forfeited.get("payload").get("participantId").asString()).isEqualTo(duel.anjuId().toString());
        JsonNode ended = privateOf(duel.vishnu(), "MATCH_ENDED").get("payload");

        assertThat(ended.get("mode").asString()).isEqualTo("TOPIC_DUEL");
        assertThat(ended.get("topic").get("topicId").asString()).isEqualTo(TOPIC.toString());
        assertThat(ended.get("topic").get("name").asString()).isEqualTo("Kerala History");
        // The set was cut short, but every question that was asked still says which topic it belongs to: the one in the topic.
        assertThat(ended.get("questions")).isNotEmpty().allSatisfy(question ->
                assertThat(question.get("topicId").asString()).isEqualTo(ended.get("topic").get("topicId").asString()));
        assertThat(placement(ended, duel.anjuId())).isEqualTo(2);
        assertThat(placement(ended, duel.vishnuId())).isEqualTo(1);

        awaitIdle(duel.anjuSub());
        await().atMost(Duration.ofSeconds(5)).until(() -> published.of(duel.matchId()).size() == 1);
        assertThat(published.of(duel.matchId()).getFirst().mode()).isEqualTo(MatchMode.TOPIC_DUEL);
    }

    @Test
    void aTopicDuelEndsAtOnceWhenAPlayerLeavesAndStillCarriesItsModeAndTopic() {
        Duel duel = startDuel();
        duel.anju().send("/app/match/" + duel.matchId() + "/leave");
        assertEndedAsATopicDuelWonByVishnu(duel);
    }

    @Test
    void aTopicDuelEndsTheSameWayWhenAPlayersConnectionDropsAndTheGraceRunsOut() {
        Duel duel = startDuel();
        duel.anju().close();
        assertEndedAsATopicDuelWonByVishnu(duel);
    }

    private static int placement(JsonNode ended, UUID participantId) {
        for (JsonNode p : ended.get("participants")) {
            if (p.get("participantId").asString().equals(participantId.toString())) {
                return p.get("placement").asInt();
            }
        }
        throw new AssertionError("no participant " + participantId);
    }

    private static JsonNode nextOf(StompTestClient client, String type) {
        for (int i = 0; i < 20; i++) {
            JsonNode frame = client.nextBroadcast(Duration.ofSeconds(5));
            if (frame.get("type").asString().equals(type)) {
                return frame;
            }
        }
        throw new AssertionError("no " + type);
    }

    /** The next private message of {@code type}. */
    private static JsonNode privateOf(StompTestClient client, String type) {
        for (int i = 0; i < 30; i++) {
            JsonNode message = client.next(Duration.ofSeconds(5));
            if (message.get("type").asString().equals(type)) {
                return message;
            }
        }
        throw new AssertionError("no " + type);
    }
}
