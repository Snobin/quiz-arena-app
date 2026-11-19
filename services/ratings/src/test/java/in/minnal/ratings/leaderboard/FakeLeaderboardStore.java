package in.minnal.ratings.leaderboard;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** An in-memory sorted-set store (same ordering as Valkey: score descending, then member descending). */
public class FakeLeaderboardStore implements LeaderboardStore {

    public final Map<String, Map<String, Double>> boards = new LinkedHashMap<>();
    public final Map<String, Duration> ttls = new HashMap<>();
    public final Set<String> markers = new HashSet<>();
    /** When true every read throws, like Valkey being down. */
    public volatile boolean failing;

    @Override
    public void set(String key, String member, double score, Duration ttl) {
        boards.computeIfAbsent(key, k -> new LinkedHashMap<>()).put(member, score);
        if (ttl != null) {
            ttls.put(key, ttl);
        }
    }

    @Override
    public void replace(String key, Map<String, Double> scores, Duration ttl) {
        if (scores.isEmpty()) {
            boards.remove(key);
            return;
        }
        boards.put(key, new LinkedHashMap<>(scores));
        if (ttl != null) {
            ttls.put(key, ttl);
        }
    }

    @Override
    public List<Row> top(String key, int offset, int limit) {
        if (failing) {
            throw new IllegalStateException("valkey down");
        }
        List<Row> rows = new ArrayList<>();
        boards.getOrDefault(key, Map.of()).forEach((m, s) -> rows.add(new Row(m, s)));
        rows.sort(Comparator.comparingDouble(Row::score).reversed().thenComparing(Comparator.comparing(Row::member).reversed()));
        return rows.stream().skip(offset).limit(limit).toList();
    }

    @Override
    public Optional<Double> score(String key, String member) {
        return Optional.ofNullable(boards.getOrDefault(key, Map.of()).get(member));
    }

    @Override
    public long countHigher(String key, double score) {
        return boards.getOrDefault(key, Map.of()).values().stream().filter(s -> s > score).count();
    }

    @Override
    public void remove(java.util.Collection<String> keys, String member) {
        for (String key : keys) {
            Map<String, Double> board = boards.get(key);
            if (board != null) {
                board.remove(member);
                if (board.isEmpty()) {
                    boards.remove(key);
                }
            }
        }
    }

    @Override
    public void setMarker(String key, String value) {
        markers.add(key);
    }

    @Override
    public boolean hasMarker(String key) {
        return markers.contains(key);
    }
}
