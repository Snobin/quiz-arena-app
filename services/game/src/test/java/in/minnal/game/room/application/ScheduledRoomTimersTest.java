package in.minnal.game.room.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** The production timers, on real (short) delays: the unit is right, cancel works, a failing task is survived. */
class ScheduledRoomTimersTest {

    final ScheduledRoomTimers timers = new ScheduledRoomTimers();

    @AfterEach
    void stop() {
        timers.destroy();
    }

    @Test
    void aTaskRunsOnTheRoomTimersThreadAfterItsDelayAndNotBefore() throws Exception {
        AtomicReference<String> thread = new AtomicReference<>();
        CountDownLatch ran = new CountDownLatch(1);
        long start = System.nanoTime();

        timers.schedule(Duration.ofMillis(150), () -> {
            thread.set(Thread.currentThread().getName());
            ran.countDown();
        });

        assertThat(ran.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isGreaterThanOrEqualTo(Duration.ofMillis(140));
        assertThat(thread.get()).isEqualTo("room-timers");
    }

    @Test
    void aCancelledTaskNeverRuns() throws Exception {
        AtomicBoolean ran = new AtomicBoolean();
        Future<?> future = timers.schedule(Duration.ofMillis(100), () -> ran.set(true));

        assertThat(future.cancel(false)).isTrue();

        // A later task on the same thread has run, so the cancelled one's time has passed.
        CountDownLatch later = new CountDownLatch(1);
        timers.schedule(Duration.ofMillis(300), later::countDown);
        assertThat(later.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(ran).isFalse();
    }

    @Test
    void aTaskThatThrowsDoesNotStopTheScheduler() throws Exception {
        timers.schedule(Duration.ZERO, () -> {
            throw new IllegalStateException("boom");
        });
        CountDownLatch after = new CountDownLatch(1);
        timers.schedule(Duration.ofMillis(50), after::countDown);

        await().atMost(Duration.ofSeconds(5)).until(() -> after.getCount() == 0);
    }
}
