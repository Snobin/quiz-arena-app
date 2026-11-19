package in.minnal.game.platform.infrastructure.ws;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.RawStomp;
import java.time.Duration;
import org.junit.jupiter.api.RepeatedTest;

/**
 * The inline inbound channel handles a session's frames in order: a SUBSCRIBE immediately followed
 * by a SEND whose reply is synchronous (the gate's BAD_REQUEST) must always find the subscription.
 */
class StompReceiveOrderTest extends GameIntegrationTest {

    static final Duration WAIT = Duration.ofSeconds(15);

    @RepeatedTest(30)
    void aSubscribeIsHandledBeforeTheSendRightBehindIt() throws Exception {
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.connect("Bearer " + JWKS.validToken());
            assertThat(stomp.nextFrame(WAIT)).startsWith("CONNECTED\n");
            stomp.send("SUBSCRIBE", "id:0", "destination:/user/queue/game");
            stomp.send("SEND", "destination:/app/matchmaking/NOPE/join");
            String frame = stomp.nextFrame(WAIT);
            assertThat(frame).as("reply to a join sent right after SUBSCRIBE").startsWith("MESSAGE\n");
            assertThat(frame).contains("\"code\":\"BAD_REQUEST\"");
        }
    }
}
