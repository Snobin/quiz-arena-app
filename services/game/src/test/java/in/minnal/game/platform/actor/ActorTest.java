package in.minnal.game.platform.actor;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class ActorTest {

    @Test
    void eventsFromManyThreadsRunOneAtATimeOnOneNamedThreadInTheOrderEachSenderTold() throws Exception {
        int senders = 8;
        int perSender = 500;
        List<int[]> handled = new ArrayList<>(); // touched only by the actor thread
        Set<String> threads = ConcurrentHashMap.newKeySet();
        int[] concurrent = {0};
        int[] maxConcurrent = {0};
        CountDownLatch done = new CountDownLatch(senders * perSender);
        try (Actor<int[]> actor = new Actor<>("test-actor", event -> {
            maxConcurrent[0] = Math.max(maxConcurrent[0], ++concurrent[0]);
            threads.add(Thread.currentThread().getName());
            handled.add(event);
            concurrent[0]--;
            done.countDown();
        }); ExecutorService pool = Executors.newFixedThreadPool(senders)) {
            for (int s = 0; s < senders; s++) {
                int sender = s;
                pool.submit(() -> {
                    for (int i = 0; i < perSender; i++) {
                        actor.tell(new int[] {sender, i});
                    }
                });
            }
            assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(threads).containsExactly("test-actor");
            assertThat(maxConcurrent[0]).isEqualTo(1);
            int[] last = new int[senders];
            java.util.Arrays.fill(last, -1);
            for (int[] event : handled) {
                assertThat(event[1]).isEqualTo(last[event[0]] + 1);
                last[event[0]] = event[1];
            }
        }
    }

    @Test
    void aFailingEventIsLoggedAndTheActorCarriesOn() throws Exception {
        CountDownLatch survived = new CountDownLatch(1);
        try (Actor<String> actor = new Actor<>("flaky", event -> {
            if (event.equals("boom")) {
                throw new IllegalStateException("boom");
            }
            survived.countDown();
        })) {
            actor.tell("boom");
            actor.tell("ok");
            assertThat(survived.await(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void onActorThreadIsTrueOnlyInsideTheHandler() throws Exception {
        CountDownLatch checked = new CountDownLatch(1);
        boolean[] inside = new boolean[1];
        @SuppressWarnings("unchecked")
        Actor<String>[] self = new Actor[1];
        try (Actor<String> actor = new Actor<>("self-check", event -> {
            inside[0] = self[0].onActorThread();
            checked.countDown();
        })) {
            self[0] = actor;
            assertThat(actor.onActorThread()).isFalse();
            actor.tell("x");
            assertThat(checked.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(inside[0]).isTrue();
        }
    }

    @Test
    void closeStopsTheThread() throws Exception {
        Actor<String> actor = new Actor<>("closing", event -> { });
        actor.close();
        actor.join(2000);
        actor.tell("ignored after close");
    }
}
