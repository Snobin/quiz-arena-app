package in.minnal.ratings.outbox;

import java.time.Instant;
import java.util.Optional;

public interface OutboxRepository {

    /** One undelivered event. */
    record Entry(long id, String stream, String payload, int attempts) {
    }

    void add(String stream, String payloadJson, Instant at);

    Optional<Entry> oldestUnpublished();

    void markPublished(long id, Instant at);

    void recordFailure(long id);
}
