package in.minnal.ratings.ingest;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.Range;
import org.springframework.data.redis.connection.RedisStreamCommands.XAddOptions;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.PendingMessage;
import org.springframework.data.redis.connection.stream.PendingMessages;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/** {@link StreamClient} on Valkey through Spring Data Redis. */
@Component
class ValkeyStreamClient implements StreamClient {

    static final long MAX_LEN = 100_000;

    private final ObjectProvider<StringRedisTemplate> redis;

    ValkeyStreamClient(ObjectProvider<StringRedisTemplate> redis) {
        this.redis = redis;
    }

    private StringRedisTemplate template() {
        StringRedisTemplate template = redis.getIfAvailable();
        if (template == null) {
            throw new IllegalStateException("Valkey is not configured");
        }
        return template;
    }

    @Override
    public void ensureGroup(String stream, String group) {
        try {
            template().execute((org.springframework.data.redis.core.RedisCallback<Object>) connection -> {
                connection.streamCommands().xGroupCreate(stream.getBytes(java.nio.charset.StandardCharsets.UTF_8), group,
                        ReadOffset.from("0"), true);
                return null;
            });
        } catch (RuntimeException e) {
            // BUSYGROUP: the group already exists, which is the normal case after the first boot.
            if (!String.valueOf(e.getMessage()).contains("BUSYGROUP") && !String.valueOf(e.getCause()).contains("BUSYGROUP")) {
                throw e;
            }
        }
    }

    @Override
    public List<Entry> readNew(String stream, String group, String consumer, int count) {
        List<MapRecord<String, Object, Object>> records = template().opsForStream().read(Consumer.from(group, consumer),
                StreamReadOptions.empty().count(count), StreamOffset.create(stream, ReadOffset.lastConsumed()));
        return entries(stream, records, 1);
    }

    @Override
    public List<Entry> claimPending(String stream, String group, String consumer, Duration minIdle, int count) {
        // Look past the first few pending entries (they may not be idle yet), then claim at most `count`.
        PendingMessages pending = template().opsForStream().pending(stream, group, Range.unbounded(), Math.max(count, 500));
        if (pending == null || pending.isEmpty()) {
            return List.of();
        }
        List<RecordId> ids = new ArrayList<>();
        Map<String, Long> delivered = new LinkedHashMap<>();
        for (PendingMessage message : pending) {
            if (ids.size() < count && message.getElapsedTimeSinceLastDelivery().compareTo(minIdle) >= 0) {
                ids.add(message.getId());
                delivered.put(message.getIdAsString(), message.getTotalDeliveryCount());
            }
        }
        if (ids.isEmpty()) {
            return List.of();
        }
        List<MapRecord<String, Object, Object>> claimed = template().opsForStream().claim(stream, group, consumer, minIdle,
                ids.toArray(RecordId[]::new));
        List<Entry> out = new ArrayList<>();
        for (MapRecord<String, Object, Object> record : claimed) {
            // XCLAIM counts this delivery too.
            out.add(entry(stream, record, delivered.getOrDefault(record.getId().getValue(), 1L) + 1));
        }
        return out;
    }

    @Override
    public void ack(String stream, String group, String id) {
        template().opsForStream().acknowledge(stream, group, id);
    }

    @Override
    public void add(String stream, Map<String, String> fields) {
        template().opsForStream().add(StreamRecords.newRecord().in(stream).ofMap(fields));
    }

    @Override
    public void addCapped(String stream, String payload) {
        template().opsForStream().add(StreamRecords.newRecord().in(stream).ofMap(Map.of("payload", payload)),
                XAddOptions.maxlen(MAX_LEN).approximateTrimming(true));
    }

    private static List<Entry> entries(String stream, List<MapRecord<String, Object, Object>> records, long deliveryCount) {
        List<Entry> out = new ArrayList<>();
        if (records != null) {
            for (MapRecord<String, Object, Object> record : records) {
                out.add(entry(stream, record, deliveryCount));
            }
        }
        return out;
    }

    private static Entry entry(String stream, MapRecord<String, Object, Object> record, long deliveryCount) {
        Map<String, String> fields = new LinkedHashMap<>();
        record.getValue().forEach((k, v) -> fields.put(String.valueOf(k), String.valueOf(v)));
        return new Entry(stream, record.getId().getValue(), fields, deliveryCount);
    }
}
