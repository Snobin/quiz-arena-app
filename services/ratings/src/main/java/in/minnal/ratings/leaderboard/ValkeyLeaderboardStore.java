package in.minnal.ratings.leaderboard;

import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Component;

/** {@link LeaderboardStore} on Valkey sorted sets through Spring Data Redis. */
@Component
class ValkeyLeaderboardStore implements LeaderboardStore {

    private final ObjectProvider<StringRedisTemplate> redis;

    ValkeyLeaderboardStore(ObjectProvider<StringRedisTemplate> redis) {
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
    public void set(String key, String member, double score, Duration ttl) {
        StringRedisTemplate template = template();
        template.opsForZSet().add(key, member, score);
        if (ttl != null) {
            template.expire(key, ttl);
        }
    }

    @Override
    public void replace(String key, Map<String, Double> scores, Duration ttl) {
        StringRedisTemplate template = template();
        if (scores.isEmpty()) {
            template.delete(key);
            return;
        }
        String temporary = key + ":rebuilding";
        template.delete(temporary);
        Set<ZSetOperations.TypedTuple<String>> tuples = new LinkedHashSet<>();
        scores.forEach((member, score) -> tuples.add(ZSetOperations.TypedTuple.of(member, score)));
        template.opsForZSet().add(temporary, tuples);
        template.expire(temporary, Duration.ofHours(1)); // never left behind if the process dies before the rename
        template.rename(temporary, key);
        if (ttl != null) {
            template.expire(key, ttl);
        } else {
            template.persist(key);
        }
    }

    @Override
    public List<Row> top(String key, int offset, int limit) {
        Set<ZSetOperations.TypedTuple<String>> rows = template().opsForZSet().reverseRangeWithScores(key, offset, (long) offset + limit - 1);
        if (rows == null) {
            return List.of();
        }
        return rows.stream().map(t -> new Row(t.getValue(), t.getScore() == null ? 0 : t.getScore())).toList();
    }

    @Override
    public Optional<Double> score(String key, String member) {
        return Optional.ofNullable(template().opsForZSet().score(key, member));
    }

    @Override
    public long countHigher(String key, double score) {
        // Scores are integers, so "strictly higher" is "at least score + 0.5".
        Long count = template().opsForZSet().count(key, score + 0.5, Double.POSITIVE_INFINITY);
        return count == null ? 0 : count;
    }

    @Override
    public void setMarker(String key, String value) {
        template().opsForValue().set(key, value);
    }

    @Override
    public boolean hasMarker(String key) {
        return Boolean.TRUE.equals(template().hasKey(key));
    }
}
