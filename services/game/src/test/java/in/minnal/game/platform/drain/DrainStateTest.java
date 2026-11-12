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
}
