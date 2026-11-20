package in.minnal.game.match;

import static in.minnal.game.match.MatchEndFlowTest.privateOf;
import static in.minnal.game.match.MatchEndFlowTest.topicOf;
import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * Story 3.4, AD-4: game-service holds each match's question set in memory, so a match whose set was fetched before a
 * publish keeps the old version in every reveal and in {@code MATCH_ENDED}; only a match whose set is fetched after
 * the publish gets the new version. core-service's side (the next draw returns the new version) is covered in core's
 * {@code AdminDraftIntegrationTest}; no module depends on both services, so the two halves are verified separately.
 */
@TestPropertySource(properties = "minnal.match.window=3s")
class MatchQuestionVersionFlowTest extends GameIntegrationTest {

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
        CORE.reset();
    }

    StompTestClient guest(String sub) {
        subs.add(sub);
        StompTestClient client = connect(guestToken(sub));
        clients.add(client);
        return client;
    }

    @Test
    void aMatchStartedOnVersion1KeepsItAfterCoreServesVersion2() {
        StompTestClient anju = guest(newSub());
        StompTestClient vishnu = guest(newSub());
        anju.join();
        vishnu.join();
        UUID matchId = UUID.fromString(anju.next("MATCH_FOUND").get("matchId").asString());
        vishnu.next("MATCH_FOUND");
        anju.subscribe(Destinations.matchTopic(matchId));
        vishnu.subscribe(Destinations.matchTopic(matchId));

        for (int q = 0; q < 10; q++) {
            JsonNode started = topicOf(anju, "QUESTION_STARTED");
            topicOf(vishnu, "QUESTION_STARTED");
            assertThat(started.get("payload").get("question").get("version").asInt()).isEqualTo(1);
            if (q == 2) {
                // A fix is published while the match plays; the next set fetched is version 2.
                CORE.version = 2;
                CORE.textPrefix = "Fixed";
                StompTestClient late = guest(newSub());
                StompTestClient later = guest(newSub());
                late.join();
                later.join();
                JsonNode other = late.next("MATCH_FOUND");
                later.next("MATCH_FOUND");
                late.subscribe(Destinations.matchTopic(UUID.fromString(other.get("matchId").asString())));
                JsonNode otherStarted = topicOf(late, "QUESTION_STARTED");
                assertThat(otherStarted.get("payload").get("question").get("version").asInt()).isEqualTo(2);
                assertThat(otherStarted.get("payload").get("question").get("textEn").asString()).startsWith("Fixed");
            }
            anju.send("/app/match/" + matchId + "/answer", "{\"questionIndex\":" + q + ",\"optionIndex\":" + (q % 4) + "}");
            vishnu.send("/app/match/" + matchId + "/answer", "{\"questionIndex\":" + q + ",\"optionIndex\":" + (q % 4) + "}");
            JsonNode revealed = topicOf(anju, "QUESTION_REVEALED");
            topicOf(vishnu, "QUESTION_REVEALED");
            assertThat(revealed.get("payload").get("version").asInt()).as("reveal %d", q).isEqualTo(1);
        }

        JsonNode ended = privateOf(anju, "MATCH_ENDED").get("payload");
        assertThat(ended.get("questions")).hasSize(10).allSatisfy(question -> {
            assertThat(question.get("version").asInt()).isEqualTo(1);
            assertThat(question.get("textEn").asString()).startsWith("Question ");
        });
    }
}
