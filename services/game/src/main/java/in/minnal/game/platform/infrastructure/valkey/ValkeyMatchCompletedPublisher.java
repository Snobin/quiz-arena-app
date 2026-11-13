package in.minnal.game.platform.infrastructure.valkey;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.game.match.application.MatchCompletedPublisher;
import in.minnal.game.match.application.MatchMetrics;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.RedisStreamCommands.XAddOptions;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StreamOperations;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code minnal.match.completed} on a Valkey stream (AD-8): {@code XADD minnal.match.completed MAXLEN ~ 100000 *
 * payload <json>}. {@link #publish} only hands the event to this publisher's own single thread, so
 * the match actor never waits on Valkey. A failed {@code XADD} is retried up to {@link #ATTEMPTS}
 * times in all, with exponential backoff from 1 s (1, 2, 4, 8 s); after the last failure the event is
 * logged as an error and {@code minnal.match.publish.failed} increments. Nothing consumes the stream
 * yet (Epic 2).
 */
public final class ValkeyMatchCompletedPublisher implements MatchCompletedPublisher, AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(ValkeyMatchCompletedPublisher.class);

    /** Attempts in all, the first included. */
    static final int ATTEMPTS = 5;
    static final Duration FIRST_BACKOFF = Duration.ofSeconds(1);
    static final long MAXLEN = 100_000;
    static final Duration CLOSE_WAIT = Duration.ofSeconds(5);

    private final StreamOperations<String, Object, Object> streams;
    private final JsonMapper json;
    private final Counter failed;
    private final ScheduledExecutorService executor;
    private final Duration firstBackoff;
    private final Duration closeWait;

    /**
     * @param json a mapper that omits nulls (absent optional fields, e.g. a guest's {@code userId})
     */
    ValkeyMatchCompletedPublisher(StreamOperations<String, Object, Object> streams, JsonMapper json, MeterRegistry meters,
            ScheduledExecutorService executor, Duration firstBackoff, Duration closeWait) {
        this.streams = streams;
        this.json = json;
        this.failed = MatchMetrics.publishFailedCounter(meters);
        this.executor = executor;
        this.firstBackoff = firstBackoff;
        this.closeWait = closeWait;
    }

    /** A publisher on its own single scheduler thread, with the 1 s first backoff. */
    static ValkeyMatchCompletedPublisher start(StreamOperations<String, Object, Object> streams, JsonMapper json,
            MeterRegistry meters) {
        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "match-completed-publisher");
            thread.setDaemon(true);
            return thread;
        });
        return new ValkeyMatchCompletedPublisher(streams, json, meters, executor, FIRST_BACKOFF, CLOSE_WAIT);
    }

    @Override
    public void publish(MatchCompletedEvent event) {
        try {
            executor.execute(() -> attempt(event, 1));
        } catch (RejectedExecutionException e) {
            giveUp(event, e);
        }
    }

    private void attempt(MatchCompletedEvent event, int attempt) {
        try {
            String payload = json.writeValueAsString(event);
            MapRecord<String, String, String> record = StreamRecords.newRecord()
                    .in(MatchCompletedEvent.STREAM)
                    .ofMap(Map.of(MatchCompletedEvent.PAYLOAD_FIELD, payload));
            RecordId id = streams.add(record, XAddOptions.maxlen(MAXLEN).approximateTrimming(true));
            log.atInfo().addKeyValue("matchId", event.matchId()).addKeyValue("eventId", event.eventId())
                    .log("published {} as {}", MatchCompletedEvent.STREAM, id);
        } catch (RuntimeException e) {
            if (attempt >= ATTEMPTS) {
                giveUp(event, e);
                return;
            }
            Duration backoff = firstBackoff.multipliedBy(1L << (attempt - 1));
            log.atWarn().addKeyValue("matchId", event.matchId()).addKeyValue("eventId", event.eventId())
                    .log("publishing {} failed (attempt {} of {}); retrying in {}: {}", MatchCompletedEvent.STREAM,
                            attempt, ATTEMPTS, backoff, e.toString());
            try {
                executor.schedule(() -> attempt(event, attempt + 1), backoff.toMillis(), TimeUnit.MILLISECONDS);
            } catch (RejectedExecutionException rejected) {
                giveUp(event, e);
            }
        }
    }

    private void giveUp(MatchCompletedEvent event, Exception cause) {
        failed.increment();
        log.atError().addKeyValue("matchId", event.matchId()).addKeyValue("eventId", event.eventId()).setCause(cause)
                .log("gave up publishing {}", MatchCompletedEvent.STREAM);
    }

    /**
     * Lets queued publishes (and pending retries) run for a few seconds, then stops the thread.
     * Each publish still queued then is dropped: counted in {@code minnal.match.publish.failed}
     * and logged as an error.
     */
    @Override
    public void close() {
        executor.shutdown();
        try {
            if (!executor.awaitTermination(closeWait.toMillis(), TimeUnit.MILLISECONDS)) {
                dropped(executor.shutdownNow().size());
            }
        } catch (InterruptedException e) {
            dropped(executor.shutdownNow().size());
            Thread.currentThread().interrupt();
        }
    }

    private void dropped(int count) {
        if (count == 0) {
            return;
        }
        failed.increment(count);
        log.error("shutting down: dropped {} unpublished {} event(s)", count, MatchCompletedEvent.STREAM);
    }
}
