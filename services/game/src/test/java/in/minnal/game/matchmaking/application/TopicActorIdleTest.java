package in.minnal.game.matchmaking.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;

/** Story 4.2: a Topic Duel actor is created by the first join and stopped after 60 s empty. */
class TopicActorIdleTest extends GameIntegrationTest {

    @Autowired
    MatchmakingService service;

    @Test
    void anEmptyTopicActorIsStoppedAfter60sAndTheNextJoinRecreatesIt() {
        String a = newSub();
        UUID topic = UUID.randomUUID();
        try (StompTestClient anju = connect(userToken(a, "Anju"))) {
            anju.send("/app/matchmaking/TOPIC_DUEL/join", "{\"topicId\":\"" + topic + "\"}");
            await().until(() -> service.hasTopicActor(topic));
            anju.send("/app/matchmaking/TOPIC_DUEL/cancel");
            anju.next("MATCHMAKING_CANCELLED");

            clock.advance(Duration.ofSeconds(59));
            await().pollDelay(Duration.ofMillis(600)).until(() -> service.hasTopicActor(topic));
            clock.advance(Duration.ofSeconds(2));
            await().until(() -> !service.hasTopicActor(topic));

            anju.send("/app/matchmaking/TOPIC_DUEL/join", "{\"topicId\":\"" + topic + "\"}");
            await().until(() -> service.hasTopicActor(topic));
            clock.advance(Duration.ofSeconds(8));
            JsonNode found = anju.next("MATCH_FOUND");
            assertThat(found.get("payload").get("participants").get(1).get("kind").asString()).isEqualTo("BOT");
            anju.send("/app/match/" + found.get("matchId").asString() + "/leave");
        }
        awaitIdle(a);
    }

    @Test
    void aTopicActorWithSomeoneQueuedIsNeverReaped() {
        String a = newSub();
        UUID topic = UUID.randomUUID();
        try (StompTestClient anju = connect(userToken(a, "Anju"))) {
            anju.send("/app/matchmaking/TOPIC_DUEL/join", "{\"topicId\":\"" + topic + "\"}");
            await().until(() -> service.hasTopicActor(topic));
            clock.advance(Duration.ofSeconds(7)); // still queued, just short of the bot
            await().pollDelay(Duration.ofMillis(600)).until(() -> service.hasTopicActor(topic));
            anju.send("/app/matchmaking/TOPIC_DUEL/cancel");
            anju.next("MATCHMAKING_CANCELLED");
        }
        awaitIdle(a);
    }
}
