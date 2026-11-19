package in.minnal.ratings.outbox;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcOutboxRepository implements OutboxRepository {

    private final JdbcClient jdbc;

    JdbcOutboxRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void add(String stream, String payloadJson, Instant at) {
        jdbc.sql("INSERT INTO event_outbox (stream, payload, created_at) VALUES (:stream, CAST(:payload AS jsonb), :at)")
                .param("stream", stream).param("payload", payloadJson).param("at", Timestamp.from(at)).update();
    }

    @Override
    public Optional<Entry> oldestUnpublished() {
        return jdbc.sql("SELECT id, stream, payload::text AS payload, attempts FROM event_outbox WHERE published_at IS NULL ORDER BY id LIMIT 1")
                .query((rs, n) -> new Entry(rs.getLong("id"), rs.getString("stream"), rs.getString("payload"), rs.getInt("attempts")))
                .optional();
    }

    @Override
    public void markPublished(long id, Instant at) {
        jdbc.sql("UPDATE event_outbox SET published_at = :at WHERE id = :id").param("at", Timestamp.from(at)).param("id", id).update();
    }

    @Override
    public void recordFailure(long id) {
        jdbc.sql("UPDATE event_outbox SET attempts = attempts + 1 WHERE id = :id").param("id", id).update();
    }
}
