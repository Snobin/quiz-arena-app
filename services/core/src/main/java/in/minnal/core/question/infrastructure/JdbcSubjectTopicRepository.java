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

    /** The outcome of a create: the id, and whether this call created it (false: the name already existed). */
    public record Created(UUID id, boolean created) {
    }

    /** Creates a subject, or reports the existing id when the name exists (subject_name_key). */
    public Created createSubject(String name, Instant now) {
        String normalised = requireName(name);
        UUID id = UUID.randomUUID();
        int inserted = jdbc.sql("""
                INSERT INTO subject (id, name, created_at) VALUES (:id, :name, :createdAt)
                ON CONFLICT ((lower(name))) DO NOTHING
                """)
                .param("id", id)
                .param("name", normalised)
                .param("createdAt", now.atOffset(ZoneOffset.UTC))
                .update();
        if (inserted == 1) {
            return new Created(id, true);
        }
        return new Created(jdbc.sql("SELECT id FROM subject WHERE lower(name) = lower(:name)")
                .param("name", normalised).query(UUID.class).single(), false);
    }

    /** Creates a topic under the subject, or reports the existing id (topic_subject_name_key). */
    public Created createTopic(UUID subjectId, String name, Instant now) {
        String normalised = requireName(name);
        UUID id = UUID.randomUUID();
        int inserted = jdbc.sql("""
                INSERT INTO topic (id, subject_id, name, created_at) VALUES (:id, :subjectId, :name, :createdAt)
                ON CONFLICT (subject_id, (lower(name))) DO NOTHING
                """)
                .param("id", id)
                .param("subjectId", subjectId)
                .param("name", normalised)
                .param("createdAt", now.atOffset(ZoneOffset.UTC))
                .update();
        if (inserted == 1) {
            return new Created(id, true);
        }
        return new Created(jdbc.sql("SELECT id FROM topic WHERE subject_id = :subjectId AND lower(name) = lower(:name)")
                .param("subjectId", subjectId).param("name", normalised).query(UUID.class).single(), false);
    }

    public boolean subjectExists(UUID subjectId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM subject WHERE id = :id)").param("id", subjectId).query(Boolean.class).single();
    }

    public java.util.Optional<String> subjectName(UUID subjectId) {
        return jdbc.sql("SELECT name FROM subject WHERE id = :id").param("id", subjectId).query(String.class).optional();
    }

    /** The topic's name when it exists under this subject. */
    public java.util.Optional<String> topicName(UUID subjectId, UUID topicId) {
        return jdbc.sql("SELECT name FROM topic WHERE id = :id AND subject_id = :subjectId")
                .param("id", topicId).param("subjectId", subjectId).query(String.class).optional();
    }

    /** A topic with the subject it belongs to. */
    public record TopicWithSubject(UUID topicId, String topicName, UUID subjectId, String subjectName) {
    }

    public java.util.Optional<TopicWithSubject> topicWithSubject(UUID topicId) {
        return jdbc.sql("SELECT t.id AS topic_id, t.name AS topic_name, s.id AS subject_id, s.name AS subject_name"
                        + " FROM topic t JOIN subject s ON s.id = t.subject_id WHERE t.id = :id")
                .param("id", topicId)
                .query((rs, i) -> new TopicWithSubject(rs.getObject("topic_id", UUID.class), rs.getString("topic_name"),
                        rs.getObject("subject_id", UUID.class), rs.getString("subject_name")))
                .optional();
    }

    private static String requireName(String name) {
        String normalised = Text.normaliseToNull(name);
        if (normalised == null) {
            throw new IllegalArgumentException("name is required");
        }
        return normalised;
    }
}
