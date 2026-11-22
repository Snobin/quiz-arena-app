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
 * Each session is a hash {@code <prefix>solo:s:{sessionId}} with {@code data} (the session JSON) and {@code rev} (a counter),
 * and {@code <prefix>solo:user:{userId}} points at the player's one active session; both have a 2 h sliding TTL. Create and
 * replace are single Lua scripts: create deletes the earlier session and writes the new one atomically, so concurrent starts
 * cannot orphan a session, and replace compares {@code rev}, so a double tap on an answer cannot count twice and a change to
 * the {@link SoloSession} record cannot make live sessions fail. The key names are new (the earlier format was a plain
 * string at {@code solo:{sessionId}}); sessions from the older release simply expire.
 */
@Component
@ConditionalOnProperty(name = "minnal.solo.store", havingValue = "valkey", matchIfMissing = true)
public class ValkeySoloSessionStore implements SoloSessionStore {

    public static final Duration TTL = Duration.ofHours(2);

    /** KEYS[1] user pointer, KEYS[2] new session; ARGV: session JSON, session id, ttl ms, session key prefix. */
    static final String CREATE = """
            local previous = redis.call('GET', KEYS[1])
            if previous then
              redis.call('DEL', ARGV[4] .. previous)
            end
            redis.call('HSET', KEYS[2], 'data', ARGV[1], 'rev', '1')
            redis.call('PEXPIRE', KEYS[2], ARGV[3])
            redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
            return 1
            """;

    /** KEYS[1] session; ARGV: expected revision, new JSON, ttl ms. Returns 1 when replaced. */
    static final String REPLACE = """
            local rev = redis.call('HGET', KEYS[1], 'rev')
            if rev and rev == ARGV[1] then
              redis.call('HSET', KEYS[1], 'data', ARGV[2], 'rev', tostring(tonumber(rev) + 1))
              redis.call('PEXPIRE', KEYS[1], ARGV[3])
              return 1
            end
            return 0
            """;

    private static final DefaultRedisScript<Long> CREATE_SCRIPT = new DefaultRedisScript<>(CREATE, Long.class);
    private static final DefaultRedisScript<Long> REPLACE_SCRIPT = new DefaultRedisScript<>(REPLACE, Long.class);

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
        return sessionPrefix() + sessionId;
    }

    private String sessionPrefix() {
        return prefix + "solo:s:";
    }

    String userKey(UUID userId) {
        return prefix + "solo:user:" + userId;
    }

    @Override
    public void create(SoloSession session) {
        redis.execute(CREATE_SCRIPT, List.of(userKey(session.userId()), sessionKey(session.sessionId())),
                json.writeValueAsString(session), session.sessionId().toString(), Long.toString(TTL.toMillis()), sessionPrefix());
    }

    @Override
    public Optional<Versioned> find(UUID sessionId) {
        List<Object> fields = redis.opsForHash().multiGet(sessionKey(sessionId), List.of("data", "rev"));
        if (fields.get(0) == null || fields.get(1) == null) {
            return Optional.empty();
        }
        redis.expire(sessionKey(sessionId), TTL);
        SoloSession session = json.readValue(fields.get(0).toString(), SoloSession.class);
        redis.expire(userKey(session.userId()), TTL);
        return Optional.of(new Versioned(session, Long.parseLong(fields.get(1).toString())));
    }

    @Override
    public boolean replace(Versioned expected, SoloSession next) {
        Long done = redis.execute(REPLACE_SCRIPT, List.of(sessionKey(expected.session().sessionId())),
                Long.toString(expected.revision()), json.writeValueAsString(next), Long.toString(TTL.toMillis()));
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
