package in.minnal.game.platform.infrastructure.valkey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.annotation.JsonInclude;
import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.game.match.application.MatchMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.connection.RedisStreamCommands.XAddOptions;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.core.StreamOperations;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ValkeyMatchCompletedPublisherTest {

    static final JsonMapper JSON = JsonMapper.builder()
            .changeDefaultPropertyInclusion(inclusion -> inclusion.withValueInclusion(JsonInclude.Include.NON_NULL))
            .build();

    @SuppressWarnings("unchecked")
    final StreamOperations<String, Object, Object> streams = mock(StreamOperations.class);
    final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    final List<Long> attemptsAtMs = new CopyOnWriteArrayList<>();
    ValkeyMatchCompletedPublisher publisher;

    @AfterEach
    void stop() {
        if (publisher != null) {
            publisher.close();
        }
    }

    ValkeyMatchCompletedPublisher publisher(Duration firstBackoff) {
        publisher = new ValkeyMatchCompletedPublisher(streams, JSON, meters, Executors.newSingleThreadScheduledExecutor(),
                firstBackoff, Duration.ofMillis(100));
        return publisher;
    }

    static MatchCompletedEvent event() {
        return MatchCompletedEvent.of(UUID.randomUUID(), MatchMode.QUICK, null, QuestionSource.BANK,
                Instant.parse("2026-11-13T10:00:00Z"), Instant.parse("2026-11-13T10:01:10Z"), 4_000L, List.of(
                        new CompletedParticipant(UUID.randomUUID(), null, ParticipantKind.GUEST, "Guest 1", 3140, 5, false, 1),
                        new CompletedParticipant(UUID.randomUUID(), null, ParticipantKind.BOT, "Minnal Bot", 2980, 4, false, 2)));
    }

    double failedCount() {
        return meters.get(MatchMetrics.PUBLISH_FAILED).counter().count();
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void publishesOneXaddWithThePayloadFieldAndApproximateMaxlen() throws Exception {
        when(streams.add(any(MapRecord.class), any(XAddOptions.class))).thenReturn(RecordId.of("1-0"));
        MatchCompletedEvent event = event();
        publisher(Duration.ofMillis(10)).publish(event);

        ArgumentCaptor<MapRecord> record = ArgumentCaptor.forClass(MapRecord.class);
        ArgumentCaptor<XAddOptions> options = ArgumentCaptor.forClass(XAddOptions.class);
        await().atMost(Duration.ofSeconds(2)).untilAsserted(() -> verify(streams).add(record.capture(), options.capture()));
        assertThat(record.getValue().getStream()).isEqualTo("minnal.match.completed");
        java.util.Map<Object, Object> fields = (java.util.Map<Object, Object>) record.getValue().getValue();
        assertThat(fields.keySet()).containsExactly("payload");
        JsonNode payload = JSON.readTree((String) fields.get("payload"));
        assertThat(payload.get("eventId").asString()).isEqualTo(event.eventId().toString());
        assertThat(payload.get("rated").asBoolean()).isTrue();
        assertThat(payload.get("participants").get(0).has("userId")).as("a guest has no userId").isFalse();
        assertThat(JSON.readValue(payload.toString(), MatchCompletedEvent.class)).isEqualTo(event);
        assertThat(options.getValue().getMaxlen()).isEqualTo(100_000L);
        assertThat(options.getValue().isApproximateTrimming()).isTrue();
        assertThat(failedCount()).isZero();
    }

    @Test
    @SuppressWarnings("unchecked")
    void publishReturnsAtOnceWhileValkeyHangs() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        when(streams.add(any(MapRecord.class), any(XAddOptions.class))).thenAnswer(invocation -> {
            release.await(5, TimeUnit.SECONDS);
            return RecordId.of("1-0");
        });
        long started = System.nanoTime();
        publisher(Duration.ofMillis(10)).publish(event());
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(100));
        release.countDown();
    }

    @Test
    @SuppressWarnings("unchecked")
    void aTransientFailureIsRetriedWithBackoffUntilItSucceeds() {
        long start = System.nanoTime();
        when(streams.add(any(MapRecord.class), any(XAddOptions.class))).thenAnswer(invocation -> {
            attemptsAtMs.add((System.nanoTime() - start) / 1_000_000);
            if (attemptsAtMs.size() < 3) {
                throw new RedisConnectionFailureException("valkey down");
            }
            return RecordId.of("1-0");
        });
        publisher(Duration.ofMillis(50)).publish(event());
        await().atMost(Duration.ofSeconds(3)).until(() -> attemptsAtMs.size() == 3);
        // Backoff 50 ms, then 100 ms.
        assertThat(attemptsAtMs.get(1) - attemptsAtMs.get(0)).isGreaterThanOrEqualTo(45);
        assertThat(attemptsAtMs.get(2) - attemptsAtMs.get(1)).isGreaterThanOrEqualTo(95);
        assertThat(failedCount()).isZero();
    }

    @Test
    @SuppressWarnings("unchecked")
    void afterFiveFailedAttemptsItGivesUpAndCountsTheFailure() throws Exception {
        when(streams.add(any(MapRecord.class), any(XAddOptions.class)))
                .thenThrow(new RedisConnectionFailureException("valkey down"));
        publisher(Duration.ofMillis(5)).publish(event());
        await().atMost(Duration.ofSeconds(3)).until(() -> failedCount() == 1);
        Thread.sleep(200);
        verify(streams, times(5)).add(any(MapRecord.class), any(XAddOptions.class));
        assertThat(failedCount()).isEqualTo(1);
    }

    @Test
    void theRealBackoffStartsAtOneSecond() {
        assertThat(ValkeyMatchCompletedPublisher.FIRST_BACKOFF).isEqualTo(Duration.ofSeconds(1));
        assertThat(ValkeyMatchCompletedPublisher.ATTEMPTS).isEqualTo(5);
    }

    @Test
    @SuppressWarnings("unchecked")
    void closingWhileARetryIsPendingCountsAndLogsTheDroppedEvent() {
        when(streams.add(any(MapRecord.class), any(XAddOptions.class)))
                .thenThrow(new RedisConnectionFailureException("valkey down"));
        ValkeyMatchCompletedPublisher closing = publisher(Duration.ofMinutes(1));
        closing.publish(event());
        await().atMost(Duration.ofSeconds(2))
                .untilAsserted(() -> verify(streams).add(any(MapRecord.class), any(XAddOptions.class)));
        closing.close();
        publisher = null;
        assertThat(failedCount()).isEqualTo(1);
        verify(streams, times(1)).add(any(MapRecord.class), any(XAddOptions.class));
    }
}
