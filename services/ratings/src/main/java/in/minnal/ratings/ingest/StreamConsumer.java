package in.minnal.ratings.ingest;

import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.ratings.directory.PlayerDirectory;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

/**
 * The {@code ratings-service} consumer group on {@code minnal.match.completed} and
 * {@code minnal.user.profileUpdated} (AD-15). Each poll first reclaims pending entries (a restart, or an entry
 * that failed) and then reads new ones; an entry is acknowledged only after its handler committed. An entry that
 * fails stays pending and is retried; when its delivery count reaches {@link #MAX_DELIVERIES} it is copied to
 * {@code minnal.deadletter} with its source, id, event id and last error, acknowledged, logged and counted.
 */
public class StreamConsumer {

    public static final String GROUP = "ratings-service";
    public static final String PROFILE_UPDATED = "minnal.user.profileUpdated";
    public static final String DEAD_LETTER = "minnal.deadletter";
    public static final String DEAD_LETTER_COUNTER = "minnal.stream.deadletter";
    public static final int MAX_DELIVERIES = 5;
    static final int BATCH = 50;

    private static final Logger log = LoggerFactory.getLogger(StreamConsumer.class);
    private static final List<String> STREAMS = List.of(MatchCompletedEvent.STREAM, PROFILE_UPDATED);

    private final StreamClient streams;
    private final MatchCompletedHandler matches;
    private final PlayerDirectory directory;
    private final JsonMapper json;
    private final Counter deadLettered;
    private final String consumerName;
    private final Duration reclaimIdle;
    private final java.util.Set<String> groupsReady = new java.util.HashSet<>();
    private boolean firstPoll = true;

    public StreamConsumer(StreamClient streams, MatchCompletedHandler matches, PlayerDirectory directory, JsonMapper json,
                          MeterRegistry meters, String consumerName, Duration reclaimIdle) {
        this.streams = streams;
        this.matches = matches;
        this.directory = directory;
        this.json = json;
        this.deadLettered = Counter.builder(DEAD_LETTER_COUNTER).description("Stream entries given up on").register(meters);
        this.consumerName = consumerName;
        this.reclaimIdle = reclaimIdle;
    }

    /**
     * One pass: pending entries first, then new ones, stream by stream. The first pass after boot reclaims every
     * pending entry whatever its idle time (this process has a new consumer name, so older deliveries were an earlier
     * run's); later passes reclaim entries idle for {@code reclaimIdle}. A failure on one stream never starves the
     * other, and a vanished group is created again. Returns entries processed.
     */
    public synchronized int poll() {
        Duration idle = firstPoll ? Duration.ZERO : reclaimIdle;
        int processed = 0;
        for (String stream : STREAMS) {
            try {
                if (!groupsReady.contains(stream)) {
                    streams.ensureGroup(stream, GROUP);
                    groupsReady.add(stream);
                }
                for (StreamClient.Entry entry : streams.claimPending(stream, GROUP, consumerName, idle, BATCH)) {
                    handle(entry);
                    processed++;
                }
                for (StreamClient.Entry entry : streams.readNew(stream, GROUP, consumerName, BATCH)) {
                    handle(entry);
                    processed++;
                }
            } catch (RuntimeException e) {
                if (String.valueOf(e).contains("NOGROUP")) {
                    groupsReady.remove(stream);
                }
                log.warn("polling {} failed: {}", stream, e.toString());
            }
        }
        firstPoll = false;
        return processed;
    }

    private void handle(StreamClient.Entry entry) {
        try {
            String payload = entry.fields().get("payload");
            if (payload == null) {
                throw new IllegalArgumentException("entry has no payload field");
            }
            if (MatchCompletedEvent.STREAM.equals(entry.stream())) {
                matches.handle(json.readValue(payload, MatchCompletedEvent.class));
            } else {
                directory.apply(payload);
            }
        } catch (RuntimeException e) {
            if (entry.deliveryCount() >= MAX_DELIVERIES) {
                deadLetter(entry, e);
            } else {
                log.warn("stream entry {} on {} failed (delivery {}), will retry: {}", entry.id(), entry.stream(),
                        entry.deliveryCount(), e.toString());
            }
            return;
        }
        // Committed. A failed ack is only logged: the entry is redelivered and the handler's keys make it a no-op,
        // and it is never mistaken for poison.
        try {
            streams.ack(entry.stream(), GROUP, entry.id());
        } catch (RuntimeException e) {
            log.warn("could not acknowledge {} on {} (it will be redelivered and ignored): {}", entry.id(), entry.stream(), e.toString());
        }
    }

    private void deadLetter(StreamClient.Entry entry, RuntimeException error) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("sourceStream", entry.stream());
        fields.put("entryId", entry.id());
        fields.put("eventId", eventId(entry));
        String message = String.valueOf(error);
        fields.put("error", message.length() > 500 ? message.substring(0, 500) : message);
        try {
            streams.add(DEAD_LETTER, fields);
            streams.ack(entry.stream(), GROUP, entry.id());
        } catch (RuntimeException e) {
            // Leave it pending: the next delivery tries the dead letter again.
            log.error("could not dead-letter {} on {}: {}", entry.id(), entry.stream(), e.toString());
            return;
        }
        deadLettered.increment();
        log.error("stream entry {} on {} dead-lettered after {} deliveries (event {}): {}", entry.id(), entry.stream(),
                entry.deliveryCount(), fields.get("eventId"), error.toString());
    }

    private String eventId(StreamClient.Entry entry) {
        try {
            var node = json.readTree(entry.fields().getOrDefault("payload", "{}"));
            var id = node.get("eventId");
            return id == null || id.isNull() ? "" : id.asString();
        } catch (RuntimeException e) {
            return "";
        }
    }
}
