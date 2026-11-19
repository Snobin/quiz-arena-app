package in.minnal.ratings.leaderboard;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Valkey sorted sets for the leaderboards. Only ratings-service writes them; scores are integers held as doubles. */
public interface LeaderboardStore {

    /** One board row: a member and its score. */
    record Row(String member, double score) {
    }

    /** {@code ZADD key score member} (absolute) and, when {@code ttl} is set, {@code EXPIRE}. */
    void set(String key, String member, double score, Duration ttl);

    /** Replaces the whole board: built under a temporary key and renamed over the live one (an empty board deletes the key). */
    void replace(String key, Map<String, Double> scores, Duration ttl);

    /** Rows from highest to lowest score, {@code offset} rows skipped. */
    List<Row> top(String key, int offset, int limit);

    Optional<Double> score(String key, String member);

    /** How many members have a strictly higher score. */
    long countHigher(String key, double score);

    /** {@code ZREM} of {@code member} from every listed key; a missing key or member is a no-op. */
    void remove(java.util.Collection<String> keys, String member);

    void setMarker(String key, String value);

    boolean hasMarker(String key);
}
