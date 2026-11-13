package in.minnal.game.matchmaking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import in.minnal.game.match.application.MatchRegistry;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;

/** Draining is one-way, so each test gets (and then discards) its own context. */
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@TestPropertySource(properties = "minnal.test.context=draining")
class DrainingTest extends GameIntegrationTest {

    @Autowired
    DrainState drain;

    @Autowired
    MatchRegistry matches;

    @Test
    void whileDrainingAJoinIsRefusedWithServerDraining() {
        String a = newSub();
        try (StompTestClient anju = connect(guestToken(a))) {
            drain.begin();
            anju.join();
            anju.error("SERVER_DRAINING");
            assertThat(participation.activityOf(a)).isEmpty();
            // Draining wins over every other check, even an unknown mode.
            anju.send("/app/matchmaking/NOPE/join");
            anju.error("SERVER_DRAINING");
        }
    }

    /** Story 1.10: a rematch request while draining is refused the same way. */
    @Test
    void whileDrainingARematchRequestIsRefusedWithServerDraining() {
        String a = newSub();
        try (StompTestClient anju = connect(guestToken(a))) {
            drain.begin();
            anju.send("/app/match/" + java.util.UUID.randomUUID() + "/rematch");
            anju.error("SERVER_DRAINING");
            assertThat(participation.activityOf(a)).isEmpty();
        }
    }

    /** A pairing whose set arrives after draining began never starts: the shutdown waits only for live matches. */
    @Test
    void aPairingInFlightWhenDrainingBeginsFails() {
        CORE.reset();
        CORE.delayMs = 500;
        String a = newSub();
        String b = newSub();
        try (StompTestClient anju = connect(guestToken(a)); StompTestClient vishnu = connect(guestToken(b))) {
            anju.join();
            vishnu.join();
            await().atMost(Duration.ofSeconds(2)).until(() -> !CORE.calls().isEmpty());
            drain.begin();
            // The drain signal, not a set failure: the client shows "try again in a moment".
            anju.error("SERVER_DRAINING");
            vishnu.error("SERVER_DRAINING");
            awaitIdle(a, b);
            assertThat(matches.liveCount()).isZero();
        } finally {
            CORE.reset();
        }
    }
}
