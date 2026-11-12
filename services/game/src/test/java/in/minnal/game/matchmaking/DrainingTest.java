package in.minnal.game.matchmaking;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.StompTestClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;

/** Draining is one-way, so this test gets (and then discards) its own context. */
@DirtiesContext
@TestPropertySource(properties = "minnal.test.context=draining")
class DrainingTest extends GameIntegrationTest {

    @Autowired
    DrainState drain;

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
}
