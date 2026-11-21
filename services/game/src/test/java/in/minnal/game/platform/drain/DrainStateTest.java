package in.minnal.game.platform.drain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DrainStateTest {

    @Test
    void stoppingTheLifecycleStartsDrainingAndItStopsFirst() {
        DrainState drain = new DrainState();
        drain.start();
        assertThat(drain.isRunning()).isTrue();
        assertThat(drain.isDraining()).isFalse();
        drain.stop();
        assertThat(drain.isDraining()).isTrue();
        assertThat(drain.isRunning()).isFalse();
        // The highest phase stops before every other lifecycle (web server, broker).
        assertThat(drain.getPhase()).isEqualTo(Integer.MAX_VALUE);
        // A resumed (test-cache) context starts again undrained.
        drain.start();
        assertThat(drain.isDraining()).isFalse();
    }

    @Test
    void listenersRunOnceWhenDrainingBeginsAndALateOneRunsAtOnce() {
        DrainState drain = new DrainState();
        java.util.concurrent.atomic.AtomicInteger early = new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicInteger late = new java.util.concurrent.atomic.AtomicInteger();
        drain.onBegin(early::incrementAndGet);
        assertThat(early).hasValue(0);
        drain.begin();
        drain.begin();
        assertThat(early).hasValue(1);
        drain.onBegin(late::incrementAndGet);
        assertThat(late).hasValue(1);
    }
}
