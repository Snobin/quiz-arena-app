package in.minnal.game.platform.infrastructure.valkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.minnal.game.matchmaking.application.RatingCache;
import in.minnal.game.platform.session.DeletedUsers;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import tools.jackson.databind.json.JsonMapper;

class RatingFeederRunnerTest {

    @Test
    void aFailedReadIsRetriedFromTheSamePositionEvenForAnErrorAndCloseStopsTheThread() {
        AtomicInteger reads = new AtomicInteger();
        RatingUpdateSource flaky = after -> {
            int n = reads.incrementAndGet();
            if (n == 1) {
                throw new IllegalStateException("valkey down");
            }
            if (n == 2) {
                throw new AssertionError("an Error must not kill the feeder");
            }
            return new RatingUpdateSource.Batch(after, List.of());
        };
        RatingFeederRunner runner = new RatingFeederRunner(new RatingFeeder(flaky, new RatingCache(), JsonMapper.builder().build()));

        await().atMost(Duration.ofSeconds(10)).until(() -> reads.get() >= 3);
        runner.close();
        int atClose = reads.get();
        try {
            Thread.sleep(300);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        assertThat(reads.get()).isLessThanOrEqualTo(atClose + 1);
    }

    @Test
    void theConfigurationHasNoFeederWithoutValkeyAndStartsAndClosesOneWithIt() {
        ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(RatingFeederConfiguration.class)
                .withBean(JsonMapper.class, () -> JsonMapper.builder().build()).withBean(RatingCache.class, RatingCache::new)
                .withBean(DeletedUsers.class, DeletedUsers::new);

        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBeansOfType(RatingFeederRunner.class)).isEmpty();
        });

        @SuppressWarnings("unchecked")
        StreamOperations<String, Object, Object> streams = mock(StreamOperations.class);
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        when(template.opsForStream()).thenReturn(streams);
        runner.withBean(StringRedisTemplate.class, () -> template).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBeansOfType(RatingFeederRunner.class)).hasSize(2); // rating cache and deleted users
        }); // closing the context closes the runner (destroyMethod)
    }
}
