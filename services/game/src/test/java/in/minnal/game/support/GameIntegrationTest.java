package in.minnal.game.support;

import in.minnal.game.platform.infrastructure.security.TestJwks;
import in.minnal.game.platform.session.ParticipationRegistry;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.awaitility.Awaitility.await;

/**
 * Base of the STOMP integration tests: the whole service on a random port, the real JWT decoder
 * against a {@link TestJwks}, a {@link FakeCore} for question sets and a {@link MutableClock}.
 * Subclasses share one application context; each test uses fresh {@code sub}s and must leave
 * nobody queued or in a match (close its clients, then {@link #awaitIdle}). {@code application-test.yaml}
 * shortens the match timeline, so a whole match takes about 3 s.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestClockConfiguration.class)
public abstract class GameIntegrationTest {

    protected static final TestJwks JWKS = TestJwks.start();
    protected static final FakeCore CORE = FakeCore.start();

    @DynamicPropertySource
    static void endpoints(DynamicPropertyRegistry registry) {
        registry.add("minnal.security.jwks-uri", JWKS::uri);
        registry.add("minnal.core.base-url", CORE::baseUrl);
        registry.add("minnal.internal.token", () -> FakeCore.TOKEN);
    }

    @AfterAll
    static void resetCore() {
        CORE.reset();
    }

    @LocalServerPort
    protected int port;

    @Autowired
    protected MutableClock clock;

    @Autowired
    protected ParticipationRegistry participation;

    /** The rate limiter's time source; frozen by a test only, and always released after it. */
    @Autowired
    protected ControllableNanos nanos;

    /** The context is shared: never let one test's frozen limiter time leak into the next. */
    @AfterEach
    void releaseRateLimiterTime() {
        nanos.release();
    }

    protected static String newSub() {
        return UUID.randomUUID().toString();
    }

    protected static String guestToken(String sub) {
        return JWKS.token(c -> c.subject(sub).claim("name", "Guest " + sub.substring(0, 4)));
    }

    protected static String userToken(String sub, String name) {
        return JWKS.token(c -> c.subject(sub).claim("roles", List.of("USER")).claim("name", name));
    }

    /** A registered player whose profile is saved: the token carries {@code profileComplete} (Story 5.1). */
    protected static String profiledToken(String sub, String name) {
        return JWKS.token(c -> c.subject(sub).claim("roles", List.of("USER")).claim("name", name).claim("profileComplete", true));
    }

    protected StompTestClient connect(String token) {
        return StompTestClient.connect(port, token);
    }

    /** Waits until none of {@code subs} holds a queue or match claim (a match ends after its last reveal). */
    protected void awaitIdle(String... subs) {
        await().atMost(Duration.ofSeconds(15))
                .until(() -> java.util.Arrays.stream(subs).allMatch(sub -> participation.activityOf(sub).isEmpty()));
    }
}
