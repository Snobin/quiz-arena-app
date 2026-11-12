package in.minnal.game.match.application;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.realtime.MatchMode;
import in.minnal.game.match.application.MatchTestKit.RecordingBroadcaster;
import in.minnal.game.match.application.MatchTestKit.RecordingChannel;
import in.minnal.game.match.domain.MatchSetup;
import in.minnal.game.platform.drain.DrainState;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerSessions;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.util.Random;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class MatchDrainTest {

    final ParticipationRegistry participation = new ParticipationRegistry();
    final ScheduledMatchTimers timers = new ScheduledMatchTimers();
    final MatchRegistry registry = new MatchRegistry(participation, new PlayerSessions(event -> { }), new RecordingChannel(),
            new RecordingBroadcaster(), Clock.systemUTC(), timers, MatchTestKit.fast(Duration.ofMillis(150)),
            new BotBrain(new BotSettings(Duration.ofMillis(5), Duration.ofMillis(20), 0.65, 0.1), new Random(3)),
            new DrainState(), new SimpleMeterRegistry());

    @AfterEach
    void stop() {
        registry.destroy();
        timers.destroy();
    }

    MatchSetup start(int questions) {
        MatchSetup setup = MatchTestKit.setup(1, 1, questions);
        participation.claim("h0", new Activity.Queued(MatchMode.QUICK));
        registry.start(setup);
        return setup;
    }

    @Test
    void stopBlocksUntilTheLiveMatchFinishes() throws Exception {
        MatchDrain drain = new MatchDrain(registry, Duration.ofSeconds(10));
        drain.start();
        start(3);
        long begun = System.nanoTime();
        CompletableFuture<Void> stopped = CompletableFuture.runAsync(drain::stop);
        Thread.sleep(150);
        assertThat(stopped).as("still waiting for the match").isNotDone();
        stopped.get(5, TimeUnit.SECONDS);
        assertThat(registry.liveCount()).isZero();
        assertThat(participation.activityOf("h0")).isEmpty();
        // 3 × (150 ms window + 50 ms grace) at the least.
        assertThat(Duration.ofNanos(System.nanoTime() - begun)).isGreaterThan(Duration.ofMillis(450));
        assertThat(drain.isRunning()).isFalse();
    }

    @Test
    void stopGivesUpAfterTheTimeout() {
        MatchDrain drain = new MatchDrain(registry, Duration.ofMillis(100));
        drain.start();
        start(10);
        long begun = System.nanoTime();
        drain.stop();
        assertThat(Duration.ofNanos(System.nanoTime() - begun)).isBetween(Duration.ofMillis(90), Duration.ofSeconds(1));
        assertThat(registry.liveCount()).isEqualTo(1);
    }

    @Test
    void aShutdownPhaseTimeoutShorterThanTheDrainTimeoutWarnsOrFailsUnderProd() {
        assertThat(MatchDrain.checkPhaseTimeout(Duration.ofMinutes(5), Duration.ofMinutes(5), true)).isTrue();
        assertThat(MatchDrain.checkPhaseTimeout(Duration.ofSeconds(30), Duration.ofMinutes(5), false)).isFalse();
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> MatchDrain.checkPhaseTimeout(Duration.ofSeconds(30), Duration.ofMinutes(5), true))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("timeout-per-shutdown-phase");
    }

    /** The shipped application.yaml lets each shutdown phase last at least as long as the drain. */
    @Test
    void theShippedConfigurationGivesTheDrainItsWholeTimeout() {
        org.springframework.beans.factory.config.YamlPropertiesFactoryBean yaml =
                new org.springframework.beans.factory.config.YamlPropertiesFactoryBean();
        yaml.setResources(new org.springframework.core.io.ClassPathResource("application.yaml"));
        java.util.Properties properties = yaml.getObject();
        Duration phase = org.springframework.boot.convert.DurationStyle.detectAndParse(
                properties.getProperty("spring.lifecycle.timeout-per-shutdown-phase"));
        Duration drainTimeout = org.springframework.boot.convert.DurationStyle.detectAndParse(
                properties.getProperty("minnal.match.drain-timeout"));
        assertThat(phase).isGreaterThanOrEqualTo(drainTimeout);
        assertThat(MatchDrain.checkPhaseTimeout(phase, drainTimeout, true)).isTrue();
    }

    @Test
    void stopReturnsAtOnceWithNoLiveMatchAndItsPhaseIsJustBelowDrainState() {
        MatchDrain drain = new MatchDrain(registry, Duration.ofMinutes(5));
        drain.start();
        assertThat(drain.isRunning()).isTrue();
        drain.stop();
        assertThat(drain.isRunning()).isFalse();
        assertThat(drain.getPhase()).isEqualTo(new DrainState().getPhase() - 1);
    }
}
