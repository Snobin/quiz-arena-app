package in.minnal.ratings.ingest;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/** The few Valkey stream operations ratings-service needs (consumer group reads, reclaim, ack, add). */
public interface StreamClient {

    /** One stream entry as a consumer received it; {@code deliveryCount} is 1 for a first delivery. */
    record Entry(String stream, String id, Map<String, String> fields, long deliveryCount) {
    }

    /** Creates the consumer group at the start of the stream (and the stream itself) when missing. */
    void ensureGroup(String stream, String group);

    /** Entries never delivered to this group, oldest first. */
    List<Entry> readNew(String stream, String group, String consumer, int count);

    /** Pending entries idle for at least {@code minIdle}, claimed for this consumer (delivery count incremented). */
    List<Entry> claimPending(String stream, String group, String consumer, Duration minIdle, int count);

    void ack(String stream, String group, String id);

    /** {@code XADD stream * fields}. */
    void add(String stream, Map<String, String> fields);

    /** {@code XADD stream MAXLEN ~ 100000 * payload <json>}. */
    void addCapped(String stream, String payload);
}
