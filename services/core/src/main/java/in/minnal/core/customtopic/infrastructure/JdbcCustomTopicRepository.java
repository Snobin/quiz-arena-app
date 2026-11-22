package in.minnal.core.customtopic.infrastructure;

import in.minnal.core.customtopic.application.CustomTopicRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcCustomTopicRepository implements CustomTopicRepository {

    private final JdbcClient jdbc;

    JdbcCustomTopicRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void deleteAllForOwner(UUID ownerId) {
        jdbc.sql("DELETE FROM custom_topic WHERE owner_user_id = :id").param("id", ownerId).update();
    }

    @Override
    public void lockOwner(UUID ownerId) {
        jdbc.sql("SELECT id FROM app_user WHERE id = :id FOR UPDATE").param("id", ownerId).query(UUID.class).optional();
    }

    @Override
    public Usage usage(UUID ownerId) {
        return jdbc.sql("SELECT count(*) AS topics, coalesce(sum(question_count), 0) AS questions FROM custom_topic WHERE owner_user_id = :id")
                .param("id", ownerId)
                .query((rs, n) -> new Usage(rs.getInt("topics"), rs.getInt("questions")))
                .single();
    }

    @Override
    public boolean nameExists(UUID ownerId, String nameKey) {
        return jdbc.sql("SELECT count(*) FROM custom_topic WHERE owner_user_id = :id AND name_key = :key")
                .param("id", ownerId).param("key", nameKey).query(Integer.class).single() > 0;
    }

    @Override
    public void insertTopic(UUID id, UUID ownerId, String name, String nameKey, int questionCount, Instant now) {
        jdbc.sql("""
                INSERT INTO custom_topic (id, owner_user_id, name, name_key, question_count, revision, created_at, updated_at)
                VALUES (:id, :owner, :name, :key, :count, 1, :at, :at)
                """)
                .param("id", id).param("owner", ownerId).param("name", name).param("key", nameKey)
                .param("count", questionCount).param("at", Timestamp.from(now)).update();
    }

    @Override
    public void insertQuestions(UUID topicId, List<Row> rows) {
        for (Row r : rows) {
            jdbc.sql("""
                    INSERT INTO custom_question (id, custom_topic_id, position, text, lang, option_a, option_b, option_c, option_d, answer_index, explanation)
                    VALUES (:id, :topic, :pos, :text, :lang, :a, :b, :c, :d, :answer, :explanation)
                    """)
                    .param("id", UUID.randomUUID()).param("topic", topicId).param("pos", r.position()).param("text", r.text())
                    .param("lang", r.lang()).param("a", r.options().get(0)).param("b", r.options().get(1))
                    .param("c", r.options().get(2)).param("d", r.options().get(3)).param("answer", r.answerIndex())
                    .param("explanation", r.explanation()).update();
        }
    }
}
