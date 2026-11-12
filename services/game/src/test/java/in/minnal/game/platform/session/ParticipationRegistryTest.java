package in.minnal.game.platform.session;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.realtime.MatchMode;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class ParticipationRegistryTest {

    final ParticipationRegistry registry = new ParticipationRegistry();
    final Activity quick = new Activity.Queued(MatchMode.QUICK);

    @Test
    void aSecondClaimSeesTheFirst() {
        assertThat(registry.claim("a", quick)).isEmpty();
        assertThat(registry.claim("a", quick)).contains(quick);
        assertThat(registry.claim("b", quick)).isEmpty();
    }

    @Test
    void aMatchReplacesTheQueueClaimAndIsReported() {
        UUID matchId = UUID.randomUUID();
        registry.claim("a", quick);
        registry.replace("a", new Activity.InMatch(matchId));
        assertThat(registry.matchOf("a")).contains(matchId);
        assertThat(registry.claim("a", quick)).contains(new Activity.InMatch(matchId));
    }

    @Test
    void releaseOnlyFreesTheExpectedActivity() {
        UUID matchId = UUID.randomUUID();
        registry.claim("a", quick);
        registry.replace("a", new Activity.InMatch(matchId));
        assertThat(registry.release("a", quick)).isFalse();
        assertThat(registry.release("a", new Activity.InMatch(UUID.randomUUID()))).isFalse();
        assertThat(registry.release("a", new Activity.InMatch(matchId))).isTrue();
        assertThat(registry.activityOf("a")).isEmpty();
        assertThat(registry.claim("a", quick)).isEmpty();
    }

    @Test
    void concurrentClaimsForOneSubHaveExactlyOneWinner() throws Exception {
        for (int round = 0; round < 50; round++) {
            String sub = "racer-" + round;
            AtomicInteger winners = new AtomicInteger();
            CountDownLatch start = new CountDownLatch(1);
            try (ExecutorService pool = Executors.newFixedThreadPool(8)) {
                for (int i = 0; i < 8; i++) {
                    pool.submit(() -> {
                        start.await();
                        if (registry.claim(sub, quick).isEmpty()) {
                            winners.incrementAndGet();
                        }
                        return null;
                    });
                }
                start.countDown();
            }
            assertThat(winners).hasValue(1);
        }
    }
}
