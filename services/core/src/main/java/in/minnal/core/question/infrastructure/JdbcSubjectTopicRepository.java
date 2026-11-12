package in.minnal.core.question.infrastructure;

import in.minnal.core.question.domain.Text;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Subjects and topics, matched by name: trimmed, NFC-normalised and case-insensitive. */
@Repository
public class JdbcSubjectTopicRepository {

    private final JdbcClient jdbc;

    public JdbcSubjectTopicRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Returns the id of the subject with this name, creating it when missing. */
    public UUID upsertSubject(String name, Instant now) {
        String normalised = requireName(name);
        jdbc.sql("""
                INSERT INTO subject (id, name, created_at) VALUES (:id, :name, :createdAt)
                ON CONFLICT ((lower(name))) DO NOTHING
                """)
                .param("id", UUID.randomUUID())
                .param("name", normalised)
                .param("createdAt", now.atOffset(ZoneOffset.UTC))
                .update();
        return jdbc.sql("SELECT id FROM subject WHERE lower(name) = lower(:name)")
                .param("name", normalised)
                .query(UUID.class)
                .single();
    }

    /** Returns the id of the topic with this name under the subject, creating it when missing. */
    public UUID upsertTopic(UUID subjectId, String name, Instant now) {
        String normalised = requireName(name);
        jdbc.sql("""
                INSERT INTO topic (id, subject_id, name, created_at) VALUES (:id, :subjectId, :name, :createdAt)
                ON CONFLICT (subject_id, (lower(name))) DO NOTHING
                """)
                .param("id", UUID.randomUUID())
                .param("subjectId", subjectId)
                .param("name", normalised)
                .param("createdAt", now.atOffset(ZoneOffset.UTC))
                .update();
        return jdbc.sql("SELECT id FROM topic WHERE subject_id = :subjectId AND lower(name) = lower(:name)")
                .param("subjectId", subjectId)
                .param("name", normalised)
                .query(UUID.class)
                .single();
    }

    private static String requireName(String name) {
        String normalised = Text.normaliseToNull(name);
        if (normalised == null) {
            throw new IllegalArgumentException("name is required");
        }
        return normalised;
    }
}
