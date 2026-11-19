package in.minnal.core.profile.infrastructure;

import in.minnal.core.profile.application.StreamPublisher;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.connection.RedisStreamCommands.XAddOptions;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/** {@code XADD <stream> MAXLEN ~100000 payload=<json>} on Valkey (AD-15). The stream name is not prefixed: it is shared. */
@Component
class RedisStreamPublisher implements StreamPublisher {

    static final long MAX_LEN = 100_000;

    private final ObjectProvider<StringRedisTemplate> redis;

    RedisStreamPublisher(ObjectProvider<StringRedisTemplate> redis) {
        this.redis = redis;
    }

    @Override
    public void publish(String stream, String payloadJson) {
        StringRedisTemplate template = redis.getIfAvailable();
        if (template == null) {
            throw new IllegalStateException("Valkey is not configured");
        }
        // One command: XADD <stream> MAXLEN ~ 100000 * payload <json>.
        template.opsForStream().add(StreamRecords.newRecord().in(stream).ofMap(Map.of("payload", payloadJson)),
                XAddOptions.maxlen(MAX_LEN).approximateTrimming(true));
    }
}
