package in.minnal.ratings.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.ratings.directory.PlayerDirectory;
import in.minnal.ratings.outbox.OutboxRelay;
import in.minnal.ratings.outbox.OutboxRepository;
import in.minnal.ratings.support.PostgresIntegrationTest;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.containers.GenericContainer;
import tools.jackson.databind.json.JsonMapper;

/** The consumer, reclaim, dead letter and relay against a real Valkey (Testcontainers; needs Docker). */
class ValkeyStreamIntegrationTest extends PostgresIntegrationTest {

    static final GenericContainer<?> VALKEY = in.minnal.ratings.support.SharedValkey.VALKEY;
    static LettuceConnectionFactory factory;
    static StringRedisTemplate redis;
    static ValkeyStreamClient client;

    @Autowired
    MatchCompletedHandler handler;

    @Autowired
    PlayerDirectory directory;

    @Autowired
    OutboxRepository outbox;

    @Autowired
    JsonMapper json;

    @BeforeAll
    static void startValkey() {
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(VALKEY.getHost(), VALKEY.getMappedPort(6379)));
        factory.afterPropertiesSet();
        redis = new StringRedisTemplate(factory);
        redis.afterPropertiesSet();
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("redis", redis);
        client = new ValkeyStreamClient(beans.getBeanProvider(StringRedisTemplate.class));
    }

    @AfterAll
    static void stopValkey() {
        if (factory != null) {
            factory.destroy();
        }
    }

    StreamConsumer consumer(String name) {
        return new StreamConsumer(client, handler, directory, json, new SimpleMeterRegistry(), name, Duration.ZERO);
    }

    long pending(String stream) {
        var summary = redis.opsForStream().pending(stream, StreamConsumer.GROUP);
        return summary == null ? 0 : summary.getTotalPendingMessages();
    }

    @Test
    void aMatchCompletedEntryIsConsumedRatedAndAcknowledgedAndTheRelayPublishesRatingUpdated() {
        redis.delete(List.of(MatchCompletedEvent.STREAM, "minnal.rating.updated", StreamConsumer.DEAD_LETTER));
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        client.add(MatchCompletedEvent.STREAM, Map.of("payload", json.writeValueAsString(rated(UUID.randomUUID(), List.of(user(a, 7000, 1), user(b, 4000, 2))))));
        StreamConsumer consumer = consumer("c1");

        assertThat(consumer.poll()).isEqualTo(1);
        assertThat(consumer.poll()).isZero(); // ensureGroup twice is fine, nothing new

        assertThat(jdbc.sql("SELECT rating FROM rating WHERE user_id = :u").param("u", a).query(Integer.class).single()).isEqualTo(1216);
        assertThat(pending(MatchCompletedEvent.STREAM)).isZero();

        OutboxRelay relay = new OutboxRelay(outbox, client, Clock.systemUTC());
        assertThat(relay.publishPending()).isEqualTo(2);
        var published = redis.opsForStream().range("minnal.rating.updated", org.springframework.data.domain.Range.unbounded());
        assertThat(published).hasSize(2);
        assertThat(String.valueOf(published.getFirst().getValue().get("payload"))).contains("\"userId\"").contains("\"rating\"");
    }

    @Test
    void anEntryReadButNeverAcknowledgedIsReclaimedWithItsDeliveryCountRaised() {
        redis.delete(List.of(MatchCompletedEvent.STREAM, StreamConsumer.PROFILE_UPDATED));
        client.add(MatchCompletedEvent.STREAM, Map.of("payload", "x"));
        client.ensureGroup(MatchCompletedEvent.STREAM, StreamConsumer.GROUP);
        client.ensureGroup(MatchCompletedEvent.STREAM, StreamConsumer.GROUP);
        List<StreamClient.Entry> first = client.readNew(MatchCompletedEvent.STREAM, StreamConsumer.GROUP, "dead-consumer", 10);
        assertThat(first).hasSize(1).allSatisfy(e -> assertThat(e.deliveryCount()).isEqualTo(1));

        List<StreamClient.Entry> reclaimed = client.claimPending(MatchCompletedEvent.STREAM, StreamConsumer.GROUP, "after-restart", Duration.ZERO, 10);

        assertThat(reclaimed).hasSize(1);
        assertThat(reclaimed.getFirst().id()).isEqualTo(first.getFirst().id());
        assertThat(reclaimed.getFirst().deliveryCount()).isEqualTo(2);
        assertThat(client.readNew(MatchCompletedEvent.STREAM, StreamConsumer.GROUP, "after-restart", 10)).isEmpty();
        client.ack(MatchCompletedEvent.STREAM, StreamConsumer.GROUP, reclaimed.getFirst().id());
        assertThat(pending(MatchCompletedEvent.STREAM)).isZero();
    }

    @Test
    void aPoisonEntryEndsInTheDeadLetterStreamAtItsFifthDeliveryAndIsAcknowledged() {
        redis.delete(List.of(MatchCompletedEvent.STREAM, StreamConsumer.DEAD_LETTER));
        String id = redis.opsForStream().add(org.springframework.data.redis.connection.stream.StreamRecords.newRecord()
                .in(MatchCompletedEvent.STREAM).ofMap(Map.of("payload", "{\"eventId\":\"e-1\",\"matchId\":\"bad\"}"))).getValue();
        StreamConsumer consumer = consumer("c1");
        for (int i = 0; i < StreamConsumer.MAX_DELIVERIES; i++) {
            consumer.poll();
        }

        assertThat(pending(MatchCompletedEvent.STREAM)).isZero();
        var dead = redis.opsForStream().range(StreamConsumer.DEAD_LETTER, org.springframework.data.domain.Range.unbounded());
        assertThat(dead).hasSize(1);
        assertThat(dead.getFirst().getValue()).containsEntry("sourceStream", MatchCompletedEvent.STREAM).containsEntry("entryId", id).containsEntry("eventId", "e-1");
    }

    @Test
    void addCappedWritesThePayloadFieldToTheStream() {
        redis.delete("minnal.rating.updated");
        client.addCapped("minnal.rating.updated", "{\"a\":1}");
        var entries = redis.opsForStream().range("minnal.rating.updated", org.springframework.data.domain.Range.unbounded());
        assertThat(entries).hasSize(1);
        assertThat(entries.getFirst().getValue()).containsEntry("payload", "{\"a\":1}");
    }
}
