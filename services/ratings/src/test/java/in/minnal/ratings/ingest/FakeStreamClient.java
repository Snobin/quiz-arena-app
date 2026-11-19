package in.minnal.ratings.ingest;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** An in-memory stream with consumer-group semantics (new vs pending, delivery counts, ack), for consumer logic tests. */
public class FakeStreamClient implements StreamClient {

    public record Stored(String id, Map<String, String> fields) {
    }

    final Map<String, List<Stored>> streams = new LinkedHashMap<>();
    /** stream|group to the index of the next never-delivered entry. */
    final Map<String, Integer> cursor = new LinkedHashMap<>();
    /** stream|group to pending entry id to delivery count. */
    final Map<String, Map<String, Long>> pending = new LinkedHashMap<>();
    int nextId = 1;
    /** Streams whose {@code addCapped} throws, to test the relay's retry. */
    public int failCappedAdds;

    public String append(String stream, Map<String, String> fields) {
        String id = (nextId++) + "-0";
        streams.computeIfAbsent(stream, s -> new ArrayList<>()).add(new Stored(id, fields));
        return id;
    }

    public List<Stored> entries(String stream) {
        return streams.getOrDefault(stream, List.of());
    }

    public Map<String, Long> pendingOf(String stream, String group) {
        return pending.getOrDefault(stream + "|" + group, Map.of());
    }

    @Override
    public void ensureGroup(String stream, String group) {
        cursor.putIfAbsent(stream + "|" + group, 0);
        streams.computeIfAbsent(stream, s -> new ArrayList<>());
    }

    @Override
    public List<Entry> readNew(String stream, String group, String consumer, int count) {
        String key = stream + "|" + group;
        List<Stored> all = entries(stream);
        List<Entry> out = new ArrayList<>();
        int at = cursor.getOrDefault(key, 0);
        while (at < all.size() && out.size() < count) {
            Stored stored = all.get(at++);
            pending.computeIfAbsent(key, k -> new LinkedHashMap<>()).put(stored.id(), 1L);
            out.add(new Entry(stream, stored.id(), stored.fields(), 1));
        }
        cursor.put(key, at);
        return out;
    }

    @Override
    public List<Entry> claimPending(String stream, String group, String consumer, Duration minIdle, int count) {
        Map<String, Long> mine = pending.computeIfAbsent(stream + "|" + group, k -> new LinkedHashMap<>());
        List<Entry> out = new ArrayList<>();
        for (Map.Entry<String, Long> p : new ArrayList<>(mine.entrySet())) {
            if (out.size() >= count) {
                break;
            }
            long delivered = p.getValue() + 1;
            mine.put(p.getKey(), delivered);
            Stored stored = entries(stream).stream().filter(s -> s.id().equals(p.getKey())).findFirst().orElseThrow();
            out.add(new Entry(stream, stored.id(), stored.fields(), delivered));
        }
        return out;
    }

    @Override
    public void ack(String stream, String group, String id) {
        Map<String, Long> mine = pending.get(stream + "|" + group);
        if (mine != null) {
            mine.remove(id);
        }
    }

    @Override
    public void add(String stream, Map<String, String> fields) {
        append(stream, fields);
    }

    @Override
    public void addCapped(String stream, String payload) {
        if (failCappedAdds > 0) {
            failCappedAdds--;
            throw new IllegalStateException("valkey down");
        }
        append(stream, Map.of("payload", payload));
    }
}
