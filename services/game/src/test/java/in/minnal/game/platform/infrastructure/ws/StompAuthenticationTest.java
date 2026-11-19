package in.minnal.game.platform.infrastructure.ws;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.support.GameIntegrationTest;
import in.minnal.game.support.RawStomp;
import in.minnal.game.support.StompTestClient;
import java.time.Duration;
import org.junit.jupiter.api.Test;

/** STOMP CONNECT is authenticated by the JWT (NFR13); everything else needs an authenticated session. */
class StompAuthenticationTest extends GameIntegrationTest {

    static final Duration WAIT = Duration.ofSeconds(15);

    void assertRejected(String authorization) throws Exception {
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.connect(authorization);
            String frame = stomp.nextFrame(WAIT);
            assertThat(frame).as("frame for Authorization=%s", authorization).startsWith("ERROR\n");
            assertThat(frame).contains("message:UNAUTHENTICATED");
            if (authorization != null) {
                assertThat(frame).doesNotContain(authorization.replace("Bearer ", ""));
            }
            assertThat(stomp.awaitClosed(WAIT)).as("socket closed after ERROR").isTrue();
        }
    }

    /**
     * A refused frame ends in an ERROR frame and a closed socket; Spring can close the socket before the frame
     * is delivered, so a closed socket with no frame is a refusal too (the same rule as MatchFlowTest).
     */
    static void assertRefusedAfterConnect(RawStomp stomp) throws Exception {
        String frame = stomp.nextFrame(WAIT);
        if (frame == null) {
            assertThat(stomp.awaitClosed(WAIT)).as("neither an ERROR frame nor a closed socket").isTrue();
        } else {
            assertThat(frame).startsWith("ERROR\n");
        }
    }

    @Test
    void aValidGuestTokenConnects() throws Exception {
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.connect("Bearer " + JWKS.validToken());
            String frame = stomp.nextFrame(WAIT);
            assertThat(frame).startsWith("CONNECTED\n");
            // The server offers 10 s heartbeats.
            assertThat(frame).contains("heart-beat:10000,10000");
        }
    }

    @Test
    void aMissingTokenGetsAnErrorFrameAndTheSocketCloses() throws Exception {
        assertRejected(null);
        assertRejected("Basic dXNlcjpwYXNz");
    }

    @Test
    void aTamperedForgedOrGarbageTokenIsRejected() throws Exception {
        assertRejected("Bearer " + JWKS.tamperedToken());
        assertRejected("Bearer " + JWKS.forgedToken());
        assertRejected("Bearer not.a.jwt");
    }

    @Test
    void anExpiredTokenIsRejected() throws Exception {
        assertRejected("Bearer " + JWKS.expiredToken());
    }

    @Test
    void framesBeforeConnectAreRejected() throws Exception {
        // Spring refuses a frame on a session that never sent CONNECT; the interceptor backs it up.
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.send("SUBSCRIBE", "id:0", "destination:/user/queue/game");
            assertRefusedAfterConnect(stomp);
            assertThat(stomp.awaitClosed(WAIT)).isTrue();
        }
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.send("SEND", "destination:/app/matchmaking/QUICK/join");
            assertRefusedAfterConnect(stomp);
            assertThat(stomp.awaitClosed(WAIT)).isTrue();
        }
    }

    @Test
    void anAuthenticatedClientCannotSendStraightToTheBroker() throws Exception {
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.connect("Bearer " + JWKS.validToken());
            assertThat(stomp.nextFrame(WAIT)).startsWith("CONNECTED\n");
            stomp.send("SEND", "destination:/topic/match/x");
            assertRefusedAfterConnect(stomp);
            assertThat(stomp.awaitClosed(WAIT)).isTrue();
        }
        try (RawStomp stomp = RawStomp.open(port)) {
            stomp.connect("Bearer " + JWKS.validToken());
            assertThat(stomp.nextFrame(WAIT)).startsWith("CONNECTED\n");
            stomp.send("SUBSCRIBE", "id:0", "destination:/queue/game-usersomeone");
            assertRefusedAfterConnect(stomp);
            assertThat(stomp.awaitClosed(WAIT)).isTrue();
        }
    }

    @Test
    void theStompClientConnectsWithTheBearerHeader() {
        try (StompTestClient client = connect(JWKS.validToken())) {
            assertThat(client.isConnected()).isTrue();
        }
    }
}
