package in.minnal.ratings.leaderboard;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.ratings.support.SharedValkey;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/** The store's own behaviour against real Valkey: ordering, rank counting with ties and negatives, replace, TTL and persist. */
class ValkeyLeaderboardStoreIntegrationTest {

    static LettuceConnectionFactory factory;
    static StringRedisTemplate redis;
    static ValkeyLeaderboardStore store;

    @BeforeAll
    static void start() {
        factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(SharedValkey.VALKEY.getHost(), SharedValkey.VALKEY.getMappedPort(6379)));
        factory.afterPropertiesSet();
        redis = new StringRedisTemplate(factory);
        redis.afterPropertiesSet();
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("redis", redis);
        store = new ValkeyLeaderboardStore(beans.getBeanProvider(StringRedisTemplate.class));
    }

    @AfterAll
    static void stop() {
        if (factory != null) {
            factory.destroy();
        }
    }

    @Test
    void topIsHighestFirstAndRanksCountOnlyStrictlyHigherScoresIncludingNegatives() {
        String key = "test:lb:ranks";
        redis.delete(key);
        store.set(key, "a", 30, null);
        store.set(key, "b", 20, null);
        store.set(key, "c", 20, null);
        store.set(key, "d", -18, null);
        store.set(key, "e", 0, null);

        assertThat(store.top(key, 0, 10)).extracting(LeaderboardStore.Row::score).containsExactly(30.0, 20.0, 20.0, 0.0, -18.0);
        assertThat(store.top(key, 1, 2)).extracting(LeaderboardStore.Row::member).hasSize(2);
        // Competition ranking: 1, 2, 2, 4, 5.
        assertThat(1 + store.countHigher(key, 30)).isEqualTo(1);
        assertThat(1 + store.countHigher(key, 20)).isEqualTo(2);
        assertThat(1 + store.countHigher(key, 0)).isEqualTo(4);
        assertThat(1 + store.countHigher(key, -18)).isEqualTo(5);
        assertThat(1 + store.countHigher(key, 31)).isEqualTo(1);
        assertThat(store.score(key, "d")).contains(-18.0);
        assertThat(store.score(key, "nobody")).isEqualTo(Optional.empty());
    }

    @Test
    void aSetIsAbsoluteAndRepeatedValuesChangeNothing() {
        String key = "test:lb:absolute";
        redis.delete(key);
        store.set(key, "a", 10, Duration.ofDays(8));
        store.set(key, "a", 10, Duration.ofDays(8));
        store.set(key, "a", 25, Duration.ofDays(8));
        assertThat(store.top(key, 0, 10)).hasSize(1);
        assertThat(store.score(key, "a")).contains(25.0);
        assertThat(redis.getExpire(key)).isBetween(7L * 86400, 8L * 86400);
    }

    @Test
    void replaceSwapsTheWholeBoardKeepsOrAddsTheTtlAndAnEmptyBoardDeletesTheKey() {
        String key = "test:lb:replace";
        redis.delete(key);
        store.set(key, "old", 99, Duration.ofDays(1));
        Map<String, Double> fresh = new LinkedHashMap<>();
        fresh.put("x", 5.0);
        fresh.put("y", -3.0);
        store.replace(key, fresh, Duration.ofDays(35));

        assertThat(store.top(key, 0, 10)).extracting(LeaderboardStore.Row::member).containsExactly("x", "y");
        assertThat(store.score(key, "old")).isEmpty();
        assertThat(redis.getExpire(key)).isBetween(34L * 86400, 35L * 86400);
        assertThat(redis.hasKey(key + ":rebuilding")).isFalse();

        store.replace(key, fresh, null); // the all-time board has no expiry
        assertThat(redis.getExpire(key)).isEqualTo(-1L);

        store.replace(key, Map.of(), null);
        assertThat(redis.hasKey(key)).isFalse();
    }

    @Test
    void markersAreSetAndSeen() {
        String key = "test:lb:meta:builtAt";
        redis.delete(key);
        assertThat(store.hasMarker(key)).isFalse();
        store.setMarker(key, "2026-11-19T10:00:00Z");
        assertThat(store.hasMarker(key)).isTrue();
        assertThat(List.of(redis.opsForValue().get(key))).containsExactly("2026-11-19T10:00:00Z");
    }
}
