package in.minnal.game.platform.infrastructure.valkey;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.connection.stream.StreamReadOptions;
import org.springframework.data.redis.core.StreamOperations;

/** {@code XREAD [COUNT n] [BLOCK ms] STREAMS minnal.rating.updated <id>}: no consumer group, the cache is in memory only. */
class ValkeyRatingUpdateSource implements RatingUpdateSource {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ValkeyRatingUpdateSource.class);

    static final int COUNT = 500;
    static final Duration BLOCK = Duration.ofSeconds(1);

    private final StreamOperations<String, Object, Object> streams;

    private final String stream;

    ValkeyRatingUpdateSource(StreamOperations<String, Object, Object> streams) {
        this(streams, RatingFeeder.STREAM);
    }

    ValkeyRatingUpdateSource(StreamOperations<String, Object, Object> streams, String stream) {
        this.streams = streams;
        this.stream = stream;
    }

    @Override
    public Batch read(String afterId) {
        List<MapRecord<String, Object, Object>> records = streams.read(StreamReadOptions.empty().count(COUNT).block(BLOCK),
                StreamOffset.create(stream, ReadOffset.from(afterId)));
        if (records == null || records.isEmpty()) {
            return new Batch(afterId, List.of());
        }
        List<String> payloads = new ArrayList<>();
        for (MapRecord<String, Object, Object> record : records) {
            Object payload = record.getValue().get("payload");
            if (payload != null) {
                payloads.add(String.valueOf(payload));
            } else {
                log.warn("skipping a {} entry {} with no payload field", stream, record.getId().getValue());
            }
        }
        return new Batch(records.getLast().getId().getValue(), payloads);
    }
}
