package in.minnal.game.matchmaking;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.platform.session.DeletedUsers;
import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.RawStomp;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Story 2.8: a deleted sub is refused at CONNECT and at join, even with a valid unexpired token. */
class DeletedUserRefusalTest extends GameIntegrationTest {

    @Autowired
    DeletedUsers deleted;

    @Test
    void connectWithADeletedSubGetsAnErrorFrameAndTheSocketCloses() throws Exception {
        String sub = newSub();
        deleted.add(sub);
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.connect("Bearer " + userToken(sub, "Anju"));
            String frame = stomp.nextFrame(Duration.ofSeconds(15));
            // Spring may close the socket before the frame arrives (see StompAuthenticationTest): a closed socket is a refusal.
            assertThat(frame == null || frame.startsWith("ERROR\n")).as("frame: %s", frame).isTrue();
            assertThat(stomp.awaitClosed(Duration.ofSeconds(15))).isTrue();
        }
    }

    @Test
    void aSessionOpenedBeforeTheDeletionIsRefusedItsJoinAndNeverQueued() {
        String sub = newSub();
        StompTestClient client = connect(userToken(sub, "Anju"));
        try {
            deleted.add(sub);
            client.join();
            client.error("UNAUTHENTICATED");
            assertThat(participation.activityOf(sub)).isEmpty();
        } finally {
            client.close();
        }
    }

    @Test
    void otherPlayersAreUnaffected() throws Exception {
        deleted.add(newSub());
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.connect("Bearer " + userToken(newSub(), "Biju"));
            assertThat(stomp.nextFrame(Duration.ofSeconds(15))).startsWith("CONNECTED\n");
        }
    }
}
