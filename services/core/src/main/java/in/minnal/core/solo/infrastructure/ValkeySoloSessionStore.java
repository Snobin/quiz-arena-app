package in.minnal.core.solo.infrastructure;

import in.minnal.core.solo.application.SoloSession;
import in.minnal.core.solo.application.SoloSessionStore;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Sessions as JSON strings: {@code <prefix>solo:{sessionId}} and {@code <prefix>solo:user:{userId}} (the player's one
 * active session), both with a 2 h sliding TTL. Updates are compare-and-set in one Lua script, so a double tap on an
 * answer cannot count twice.
 */
@Component
@ConditionalOnProperty(name = "minnal.solo.store", havingValue = "valkey", matchIfMissing = true)
public class ValkeySoloSessionStore implements SoloSessionStore {

    public static final Duration TTL = Duration.ofHours(2);

    /** KEYS[1] session; ARGV: expected raw value, new raw value, ttl ms. Returns 1 when replaced. */
    static final String CAS = """
            if redis.call('GET', KEYS[1]) == ARGV[1] then
              redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
              return 1
            end
            return 0
            """;

    private static final DefaultRedisScript<Long> CAS_SCRIPT = new DefaultRedisScript<>(CAS, Long.class);

    private final StringRedisTemplate redis;
    private final JsonMapper json;
    private final String prefix;

    public ValkeySoloSessionStore(StringRedisTemplate redis, JsonMapper json,
                                  @Value("${minnal.valkey.key-prefix:core:}") String prefix) {
        this.redis = redis;
        this.json = json;
        this.prefix = prefix;
    }

    String sessionKey(UUID sessionId) {
        return prefix + "solo:" + sessionId;
    }

    String userKey(UUID userId) {
        return prefix + "solo:user:" + userId;
    }

    @Override
    public void create(SoloSession session) {
        String previous = redis.opsForValue().get(userKey(session.userId()));
        if (previous != null) {
            redis.delete(prefix + "solo:" + previous);
        }
        redis.opsForValue().set(sessionKey(session.sessionId()), json.writeValueAsString(session), TTL);
        redis.opsForValue().set(userKey(session.userId()), session.sessionId().toString(), TTL);
    }

    @Override
    public Optional<SoloSession> find(UUID sessionId) {
        String raw = redis.opsForValue().getAndExpire(sessionKey(sessionId), TTL);
        if (raw == null) {
            return Optional.empty();
        }
        SoloSession session = json.readValue(raw, SoloSession.class);
        redis.expire(userKey(session.userId()), TTL);
        return Optional.of(session);
    }

    @Override
    public boolean replace(SoloSession expected, SoloSession next) {
        Long done = redis.execute(CAS_SCRIPT, List.of(sessionKey(expected.sessionId())),
                json.writeValueAsString(expected), json.writeValueAsString(next), Long.toString(TTL.toMillis()));
        return done != null && done == 1L;
    }

    @Override
    public void delete(SoloSession session) {
        redis.delete(sessionKey(session.sessionId()));
        String pointer = redis.opsForValue().get(userKey(session.userId()));
        if (session.sessionId().toString().equals(pointer)) {
            redis.delete(userKey(session.userId()));
        }
    }
}
