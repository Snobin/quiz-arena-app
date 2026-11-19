package in.minnal.game.platform.infrastructure.valkey;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.events.UserDeletedEvent;
import in.minnal.game.platform.session.DeletedUsers;
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

/** The deleted-user feeder reads {@code minnal.user.deleted} (and only it) through the real Valkey source. */
class ValkeyDeletedUserFeederIntegrationTest {

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

    static void add(String stream, String payload) {
        redis.opsForStream().add(StreamRecords.newRecord().in(stream).ofMap(Map.of("payload", payload)));
    }

    @Test
    void readsUserDeletedEntriesAndIgnoresTheRatingStream() {
        redis.delete(UserDeletedEvent.STREAM);
        redis.delete(RatingFeeder.STREAM);
        add(UserDeletedEvent.STREAM, "{\"eventId\":\"e\",\"userId\":\"gone-sub\",\"occurredAt\":\"2026-11-19T10:00:00Z\"}");
        add(RatingFeeder.STREAM, "{\"eventId\":\"e\",\"userId\":\"rated-sub\",\"mode\":\"QUICK\",\"rating\":1300,\"ratedAt\":\"2026-11-19T10:00:00Z\"}");
        DeletedUsers deleted = new DeletedUsers();
        DeletedUserFeeder feeder = new DeletedUserFeeder(
                new ValkeyRatingUpdateSource(redis.opsForStream(), UserDeletedEvent.STREAM), deleted, JsonMapper.builder().build());

        assertThat(feeder.pollOnce()).isEqualTo(1);

        assertThat(deleted.contains("gone-sub")).isTrue();
        assertThat(deleted.contains("rated-sub")).isFalse();
    }
}
