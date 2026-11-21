package in.minnal.game.match;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.game.GameApplication;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.infrastructure.security.TestJwks;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.support.FakeCore;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import tools.jackson.databind.JsonNode;

/**
 * Shutdown mid-match (NFR7, AD-19): new joins get {@code SERVER_DRAINING}, the live match plays on to
 * its last reveal over the still-open sockets, and only then does the shutdown complete. It runs
 * (and closes) its own application, outside the test framework's context cache.
 */
class MatchDrainIntegrationTest {

    final TestJwks jwks = TestJwks.start();
    final FakeCore core = FakeCore.start();
    ConfigurableApplicationContext app;

    @AfterEach
    void stop() throws Exception {
        if (app != null) {
            app.close();
        }
        core.close();
        jwks.close();
    }

    String guestToken(String sub) {
        return jwks.token(c -> c.subject(sub).claim("name", "Guest " + sub.substring(0, 4)));
    }

    @Test
    void shutdownWaitsForTheLiveMatchWhileRefusingNewJoins() throws Exception {
        app = new SpringApplicationBuilder(GameApplication.class)
                .profiles("test")
                .run("--server.port=0",
                        "--minnal.security.jwks-uri=" + jwks.uri(),
                        "--minnal.core.base-url=" + core.baseUrl(),
                        "--minnal.internal.token=" + FakeCore.TOKEN,
                        "--minnal.match.window=300ms");
        int port = Integer.parseInt(app.getEnvironment().getProperty("local.server.port"));
        DrainState drain = app.getBean(DrainState.class);
        ParticipationRegistry participation = app.getBean(ParticipationRegistry.class);

        String a = UUID.randomUUID().toString();
        String b = UUID.randomUUID().toString();
        org.springframework.messaging.simp.user.SimpUserRegistry registry = app.getBean(org.springframework.messaging.simp.user.SimpUserRegistry.class);
        StompTestClient anju = StompTestClient.connect(port, guestToken(a)).withRegistry(registry);
        StompTestClient vishnu = StompTestClient.connect(port, guestToken(b));
        StompTestClient late = StompTestClient.connect(port, guestToken(UUID.randomUUID().toString()));
        anju.join();
        vishnu.join();
        String matchId = anju.next("MATCH_FOUND").get("matchId").asString();
        vishnu.next("MATCH_FOUND");
        anju.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        anju.nextBroadcast("QUESTION_STARTED");

        CompletableFuture<Void> closing = CompletableFuture.runAsync(app::close);
        await().atMost(Duration.ofSeconds(2)).until(drain::isDraining);
        late.join();
        late.error("SERVER_DRAINING");

        int reveals = 0;
        while (reveals < 10) {
            JsonNode message = anju.nextBroadcast(Duration.ofSeconds(5));
            if (message.get("type").asString().equals("QUESTION_REVEALED")) {
                reveals++;
                if (reveals < 10) {
                    assertThat(closing).as("shutdown waits for reveal 10 (now %d)", reveals).isNotDone();
                }
            }
        }
        closing.get(10, TimeUnit.SECONDS);
        // The match ended (players released) before the shutdown went on.
        assertThat(participation.activityOf(a)).isEmpty();
        assertThat(participation.activityOf(b)).isEmpty();
        assertThat(app.isActive()).isFalse();
    }
}
