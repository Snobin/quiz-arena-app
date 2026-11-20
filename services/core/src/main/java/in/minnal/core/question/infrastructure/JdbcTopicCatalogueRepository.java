package in.minnal.core.question.infrastructure;

import in.minnal.core.question.domain.ContentCategory;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Published-question counts per topic (computed, never stored) and a player's recent topics. */
@Repository
public class JdbcTopicCatalogueRepository {

    /** One playable topic: its subject and its published-question count. */
    public record TopicRow(UUID subjectId, String subjectName, UUID topicId, String topicName, int publishedCount) {
    }

    /** The single definition of "playable": non-deleted questions, latest PUBLISHED version, category, count at least the threshold. */
    private static final String ELIGIBLE = """
            WITH latest AS (
                SELECT DISTINCT ON (qv.question_id) qv.question_id, qv.topic_id, qv.content_category
                FROM question_version qv
                JOIN question q ON q.id = qv.question_id
                WHERE q.deleted_at IS NULL AND qv.status = 'PUBLISHED'
                ORDER BY qv.question_id, qv.version DESC
            ), counts AS (
                SELECT topic_id, count(*)::int AS published_count
                FROM latest
                WHERE content_category = :category
                GROUP BY topic_id
                HAVING count(*) >= :min
            )
            SELECT s.id AS subject_id, s.name AS subject_name, t.id AS topic_id, t.name AS topic_name, c.published_count
            FROM counts c
            JOIN topic t ON t.id = c.topic_id
            JOIN subject s ON s.id = t.subject_id
            """;

    private final JdbcClient jdbc;

    public JdbcTopicCatalogueRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Every eligible topic, ordered by subject name then topic name. */
    public List<TopicRow> eligible(ContentCategory category, int min) {
        return jdbc.sql(ELIGIBLE + " ORDER BY lower(s.name), s.name, s.id, lower(t.name), t.name, t.id")
                .param("category", category.name())
                .param("min", min)
                .query((rs, n) -> map(rs))
                .list();
    }

    /** The user's recent topics, newest first, that are still eligible: at most {@code limit}. */
    public List<TopicRow> recentEligible(UUID userId, ContentCategory category, int min, int limit) {
        return jdbc.sql(ELIGIBLE + " JOIN recent_topic r ON r.topic_id = t.id AND r.user_id = :userId ORDER BY r.last_used_at DESC, t.id LIMIT :limit")
                .param("category", category.name())
                .param("min", min)
                .param("userId", userId)
                .param("limit", limit)
                .query((rs, n) -> map(rs))
                .list();
    }

    public boolean topicExists(UUID topicId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM topic WHERE id = :id)").param("id", topicId).query(Boolean.class).single();
    }

    /** Upserts the use and keeps only the {@code keep} newest rows for the user. Call inside a transaction. */
    public void touch(UUID userId, UUID topicId, Instant now, int keep) {
        jdbc.sql("""
                INSERT INTO recent_topic (user_id, topic_id, last_used_at) VALUES (:u, :t, :at)
                ON CONFLICT (user_id, topic_id) DO UPDATE SET last_used_at = EXCLUDED.last_used_at
                """)
                .param("u", userId).param("t", topicId).param("at", now.atOffset(ZoneOffset.UTC)).update();
        jdbc.sql("""
                DELETE FROM recent_topic WHERE user_id = :u AND topic_id NOT IN (
                    SELECT topic_id FROM recent_topic WHERE user_id = :u ORDER BY last_used_at DESC, topic_id LIMIT :keep)
                """)
                .param("u", userId).param("keep", keep).update();
    }

    public void deleteForUser(UUID userId) {
        jdbc.sql("DELETE FROM recent_topic WHERE user_id = :u").param("u", userId).update();
    }

    private static TopicRow map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new TopicRow(rs.getObject("subject_id", UUID.class), rs.getString("subject_name"),
                rs.getObject("topic_id", UUID.class), rs.getString("topic_name"), rs.getInt("published_count"));
    }
}
