package in.minnal.game.platform.infrastructure.valkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.game.match.application.MatchCompletedPublisher;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.redis.connection.RedisStreamCommands.XAddOptions;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.core.StreamOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The publisher bean: Valkey with a null-omitting mapper when Redis is configured, else the logging fallback. */
class ValkeyEventsConfigurationTest {

    static final JsonMapper JSON = JsonMapper.builder().build();

    final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(ValkeyEventsConfiguration.class)
            .withBean(JsonMapper.class, () -> JSON)
            .withBean(MeterRegistry.class, SimpleMeterRegistry::new);

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void withATemplateItPublishesToValkeyWithoutNullFields() {
        StreamOperations<String, Object, Object> streams = mock(StreamOperations.class);
        when(streams.add(any(MapRecord.class), any(XAddOptions.class))).thenReturn(RecordId.of("1-0"));
        StringRedisTemplate template = mock(StringRedisTemplate.class);
        when(template.opsForStream()).thenReturn(streams);
        runner.withBean(StringRedisTemplate.class, () -> template).run(context -> {
            MatchCompletedPublisher publisher = context.getBean(MatchCompletedPublisher.class);
            assertThat(publisher).isInstanceOf(ValkeyMatchCompletedPublisher.class);
            publisher.publish(MatchCompletedEvent.of(UUID.randomUUID(), MatchMode.QUICK, null, QuestionSource.BANK,
                    Instant.parse("2026-11-13T10:00:00Z"), Instant.parse("2026-11-13T10:01:00Z"), null, List.of(
                            new CompletedParticipant(UUID.randomUUID(), null, ParticipantKind.GUEST, "Guest 1", 900, 1,
                                    false, 1))));
            ArgumentCaptor<MapRecord> record = ArgumentCaptor.forClass(MapRecord.class);
            await().atMost(Duration.ofSeconds(2))
                    .untilAsserted(() -> verify(streams).add(record.capture(), any(XAddOptions.class)));
            Map<Object, Object> fields = (Map<Object, Object>) record.getValue().getValue();
            JsonNode payload = JSON.readTree((String) fields.get(MatchCompletedEvent.PAYLOAD_FIELD));
            assertThat(payload.has("roomId")).isFalse();
            assertThat(payload.has("queueWaitMs")).isFalse();
            assertThat(payload.get("participants").get(0).has("userId")).isFalse();
            assertThat(payload.get("rated").asBoolean()).isTrue();
        });
    }

    @Test
    void withoutATemplateItFallsBackToLogging() {
        runner.run(context -> assertThat(context.getBean(MatchCompletedPublisher.class))
                .isInstanceOf(LoggingMatchCompletedPublisher.class));
    }
}
