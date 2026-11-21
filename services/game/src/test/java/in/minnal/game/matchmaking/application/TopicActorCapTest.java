package in.minnal.game.matchmaking.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

/** Concurrent Topic Duel actors are capped; a join that would create one over the cap gets MODE_UNAVAILABLE. */
@TestPropertySource(properties = "minnal.matchmaking.max-topic-actors=1")
class TopicActorCapTest extends GameIntegrationTest {

    @Autowired
    MatchmakingService service;

    @Test
    void aJoinOverTheTopicActorCapIsRefusedAndQuickIsNeverCounted() {
        String a = newSub();
        String b = newSub();
        String c = newSub();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        try (StompTestClient anju = connect(userToken(a, "Anju"));
                StompTestClient biju = connect(userToken(b, "Biju"));
                StompTestClient chitra = connect(userToken(c, "Chitra"))) {
            anju.send("/app/matchmaking/TOPIC_DUEL/join", "{\"topicId\":\"" + first + "\"}");
            await().until(() -> service.hasTopicActor(first));

            biju.send("/app/matchmaking/TOPIC_DUEL/join", "{\"topicId\":\"" + second + "\"}");
            biju.error("MODE_UNAVAILABLE");
            assertThat(participation.activityOf(b)).isEmpty();
            assertThat(service.hasTopicActor(second)).isFalse();
            assertThat(service.hasTopicActor(first)).isTrue();

            // Quick Match is unaffected by the cap.
            chitra.join();
            await().until(() -> participation.activityOf(c).isPresent());
            chitra.cancel();
            chitra.next("MATCHMAKING_CANCELLED");

            anju.send("/app/matchmaking/TOPIC_DUEL/cancel");
            anju.next("MATCHMAKING_CANCELLED");
        }
        awaitIdle(a, b, c);
    }
}
