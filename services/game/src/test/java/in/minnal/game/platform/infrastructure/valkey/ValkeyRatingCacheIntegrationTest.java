package in.minnal.game.platform.infrastructure.valkey;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.game.matchmaking.application.RatingCache;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import tools.jackson.databind.json.JsonMapper;

/** The rating cache's reader against a real Valkey (Testcontainers; needs Docker): replay from the start, then follow. */
class ValkeyRatingCacheIntegrationTest {

    static final GenericContainer<?> VALKEY = new GenericContainer<>("valkey/valkey:8-alpine").withExposedPorts(6379);
    static LettuceConnectionFactory factory;
    static StringRedisTemplate redis;

    @BeforeAll
    static void start() {
        VALKEY.start();
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(VALKEY.getHost(), VALKEY.getMappedPort(6379)));
        factory.afterPropertiesSet();
        redis = new StringRedisTemplate(factory);
        redis.afterPropertiesSet();
    }

    @AfterAll
    static void stop() {
        factory.destroy();
        VALKEY.stop();
    }

    static void add(String user, int rating, String ratedAt) {
        redis.opsForStream().add(StreamRecords.newRecord().in(RatingFeeder.STREAM).ofMap(Map.of("payload",
                "{\"eventId\":\"e\",\"userId\":\"" + user + "\",\"mode\":\"QUICK\",\"rating\":" + rating + ",\"ratedAt\":\"" + ratedAt + "\"}")));
    }

    @Test
    void replaysTheWholeStreamFromTheStartThenFollowsNewEntriesAndKeepsTheLatestRatedAt() {
        redis.delete(RatingFeeder.STREAM);
        add("anju", 1500, "2026-11-19T10:00:00Z");
        add("anju", 1480, "2026-11-19T09:00:00Z"); // older, later in the stream: must not win
        add("biju", 1250, "2026-11-19T10:00:00Z");
        RatingCache cache = new RatingCache();
        RatingFeeder feeder = new RatingFeeder(new ValkeyRatingUpdateSource(redis.opsForStream()), cache, JsonMapper.builder().build());

        assertThat(feeder.pollOnce()).isEqualTo(3);
        assertThat(cache.ratingOf("anju", "QUICK")).isEqualTo(1500);
        assertThat(cache.ratingOf("biju", "QUICK")).isEqualTo(1250);

        add("anju", 1516, "2026-11-19T11:00:00Z");
        assertThat(feeder.pollOnce()).isEqualTo(1);
        assertThat(cache.ratingOf("anju", "QUICK")).isEqualTo(1516);
        // Nothing new: the blocking read returns empty after its short wait and changes nothing.
        long start = System.nanoTime();
        assertThat(feeder.pollOnce()).isZero();
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
    }

    @Test
    void aFeederStartedAgainReplaysTheSameCache() {
        redis.delete(RatingFeeder.STREAM);
        add("anju", 1500, "2026-11-19T10:00:00Z");
        for (int boot = 0; boot < 2; boot++) {
            RatingCache cache = new RatingCache();
            new RatingFeeder(new ValkeyRatingUpdateSource(redis.opsForStream()), cache, JsonMapper.builder().build()).pollOnce();
            assertThat(cache.ratingOf("anju", "QUICK")).isEqualTo(1500);
        }
    }
}
