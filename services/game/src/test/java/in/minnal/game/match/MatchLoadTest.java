package in.minnal.game.match;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.realtime.Destinations;
import in.minnal.contracts.realtime.MessageType;
import in.minnal.game.match.application.MatchMetrics;
import in.minnal.game.platform.infrastructure.security.TestJwks;
import in.minnal.game.support.FakeCore;
import in.minnal.game.support.StompTestClient;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.distribution.ValueAtPercentile;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * NFR1/NFR2 under load: 100 concurrent matches, each between two real STOMP clients, on the real
 * server clock with shortened windows. Asserts from the service's own Micrometer timers that
 * answer → {@code ANSWER_ACCEPTED} is under 200 ms at p95 and every broadcast leaves within 500 ms
 * of its trigger at p95. Excluded from the default build; run it with
 * {@code ./mvnw -pl services/game -Dgroups=load test}.
 */
@Tag("load")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class MatchLoadTest {

    private static final Logger log = LoggerFactory.getLogger(MatchLoadTest.class);

    static final int MATCHES = 100;
    static final TestJwks JWKS = TestJwks.start();
    static final FakeCore CORE = FakeCore.start();

    @DynamicPropertySource
    static void endpoints(DynamicPropertyRegistry registry) {
        registry.add("minnal.security.jwks-uri", JWKS::uri);
        registry.add("minnal.core.base-url", CORE::baseUrl);
        registry.add("minnal.internal.token", () -> FakeCore.TOKEN);
        registry.add("minnal.test.context", () -> "load");
        registry.add("minnal.match.lead-in", () -> "1500ms");
        registry.add("minnal.match.window", () -> "1s");
        registry.add("minnal.match.reveal-hold", () -> "200ms");
    }

    @AfterAll
    static void stopFakes() {
        CORE.close();
        JWKS.close();
    }

    @LocalServerPort
    int port;

    @Autowired
    MeterRegistry meters;

    /** One player: join, subscribe, answer every question at a random moment, until the 10th reveal. */
    Integer play(StompTestClient client) {
        client.join();
        JsonNode found = client.next(Duration.ofSeconds(20));
        assertThat(found.get("type").asString()).isEqualTo("MATCH_FOUND");
        String matchId = found.get("matchId").asString();
        client.subscribe(Destinations.matchTopic(UUID.fromString(matchId)));
        int reveals = 0;
        while (reveals < 10) {
            JsonNode message = client.nextBroadcast(Duration.ofSeconds(20));
            switch (message.get("type").asString()) {
                case "QUESTION_STARTED" -> {
                    int index = message.get("payload").get("questionIndex").asInt();
                    sleep(ThreadLocalRandom.current().nextLong(0, 800));
                    client.send("/app/match/" + matchId + "/answer", "{\"questionIndex\":" + index
                            + ",\"optionIndex\":" + ThreadLocalRandom.current().nextInt(4) + "}");
                }
                case "QUESTION_REVEALED" -> reveals++;
                default -> { }
            }
        }
        return reveals;
    }

    static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    static double p95Ms(Timer timer) {
        for (ValueAtPercentile value : timer.takeSnapshot().percentileValues()) {
            if (value.percentile() == 0.95) {
                return value.value(TimeUnit.MILLISECONDS);
            }
        }
        throw new AssertionError("no p95 on " + timer.getId());
    }

    @Test
    void hundredConcurrentMatchesStayWithinTheLatencyBudgets() throws Exception {
        List<StompTestClient> clients = new ArrayList<>();
        for (int i = 0; i < MATCHES * 2; i++) {
            String sub = UUID.randomUUID().toString();
            clients.add(StompTestClient.connect(port, JWKS.token(c -> c.subject(sub).claim("name", "Load " + sub.substring(0, 4)))));
        }
        try (ExecutorService players = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<Integer>> games = new ArrayList<>();
            for (StompTestClient client : clients) {
                games.add(players.submit(() -> play(client)));
            }
            for (Future<Integer> game : games) {
                assertThat(game.get(2, TimeUnit.MINUTES)).isEqualTo(10);
            }
        } finally {
            clients.forEach(StompTestClient::close);
        }

        Timer ack = meters.get(MatchMetrics.ACK).timer();
        double ackP95 = p95Ms(ack);
        log.info("load: {} acks, p95 {} ms, max {} ms", ack.count(), ackP95, ack.max(TimeUnit.MILLISECONDS));
        assertThat(ack.count()).isGreaterThanOrEqualTo(MATCHES * 2 * 10 * 9 / 10);
        assertThat(ackP95).as("answer → ANSWER_ACCEPTED p95").isLessThan(200);
        for (MessageType type : List.of(MessageType.QUESTION_STARTED, MessageType.SCOREBOARD, MessageType.QUESTION_REVEALED)) {
            Timer lag = meters.get(MatchMetrics.BROADCAST_LAG).tag("kind", type.name()).timer();
            double p95 = p95Ms(lag);
            log.info("load: {} {} broadcasts, lag p95 {} ms, max {} ms", lag.count(), type, p95, lag.max(TimeUnit.MILLISECONDS));
            assertThat(lag.count()).isPositive();
            assertThat(p95).as("%s broadcast lag p95", type).isLessThan(500);
        }
        assertThat(meters.get(MatchMetrics.ENDED).tag("mode", "QUICK").counter().count()).isEqualTo(MATCHES);
    }
}
