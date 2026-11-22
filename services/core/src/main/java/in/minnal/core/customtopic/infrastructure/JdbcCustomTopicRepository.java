package in.minnal.core.customtopic.infrastructure;

import in.minnal.core.customtopic.application.CustomTopicRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
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
    public List<Summary> list(UUID ownerId) {
        return jdbc.sql("SELECT id, name, question_count, updated_at FROM custom_topic WHERE owner_user_id = :o ORDER BY updated_at DESC, id")
                .param("o", ownerId)
                .query((rs, n) -> new Summary(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("question_count"),
                        rs.getTimestamp("updated_at").toInstant()))
                .list();
    }

    @Override
    public Optional<Detail> find(UUID ownerId, UUID topicId) {
        return jdbc.sql("SELECT id, name, question_count, revision, updated_at FROM custom_topic WHERE id = :id AND owner_user_id = :o")
                .param("id", topicId).param("o", ownerId)
                .query((rs, n) -> new Detail(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("question_count"),
                        rs.getInt("revision"), rs.getTimestamp("updated_at").toInstant(), List.of()))
                .optional()
                .map(d -> new Detail(d.id(), d.name(), d.questionCount(), d.revision(), d.updatedAt(), rows(topicId)));
    }

    @Override
    public Optional<Header> header(UUID ownerId, UUID topicId) {
        return jdbc.sql("SELECT id, name, question_count, revision FROM custom_topic WHERE id = :id AND owner_user_id = :o")
                .param("id", topicId).param("o", ownerId)
                .query((rs, n) -> new Header(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("revision"), rs.getInt("question_count")))
                .optional();
    }

    @Override
    public List<UUID> questionIds(UUID topicId) {
        return jdbc.sql("SELECT id FROM custom_question WHERE custom_topic_id = :t ORDER BY position")
                .param("t", topicId).query(UUID.class).list();
    }

    @Override
    public Optional<Stored> question(UUID topicId, UUID questionId) {
        return jdbc.sql("""
                SELECT id, position, text, lang, option_a, option_b, option_c, option_d, answer_index, explanation
                FROM custom_question WHERE custom_topic_id = :t AND id = :q
                """)
                .param("t", topicId).param("q", questionId)
                .query((rs, n) -> new Stored(rs.getObject("id", UUID.class), new Row(rs.getInt("position"), rs.getString("text"), rs.getString("lang"),
                        List.of(rs.getString("option_a"), rs.getString("option_b"), rs.getString("option_c"), rs.getString("option_d")),
                        rs.getInt("answer_index"), rs.getString("explanation"))))
                .optional();
    }

    private List<Row> rows(UUID topicId) {
        return jdbc.sql("""
                SELECT position, text, lang, option_a, option_b, option_c, option_d, answer_index, explanation
                FROM custom_question WHERE custom_topic_id = :t ORDER BY position
                """)
                .param("t", topicId)
                .query((rs, n) -> new Row(rs.getInt("position"), rs.getString("text"), rs.getString("lang"),
                        List.of(rs.getString("option_a"), rs.getString("option_b"), rs.getString("option_c"), rs.getString("option_d")),
                        rs.getInt("answer_index"), rs.getString("explanation")))
                .list();
    }

    @Override
    public boolean nameExistsOther(UUID ownerId, String nameKey, UUID excludeId) {
        return jdbc.sql("SELECT count(*) FROM custom_topic WHERE owner_user_id = :o AND name_key = :k AND id <> :x")
                .param("o", ownerId).param("k", nameKey).param("x", excludeId).query(Integer.class).single() > 0;
    }

    @Override
    public boolean updateTopic(UUID ownerId, UUID topicId, String name, String nameKey, int questionCount, Instant now) {
        return jdbc.sql("""
                UPDATE custom_topic SET name = :name, name_key = :key, question_count = :count, revision = revision + 1, updated_at = :at
                WHERE id = :id AND owner_user_id = :o
                """)
                .param("name", name).param("key", nameKey).param("count", questionCount).param("at", Timestamp.from(now))
                .param("id", topicId).param("o", ownerId).update() > 0;
    }

    @Override
    public void deleteQuestions(UUID topicId) {
        jdbc.sql("DELETE FROM custom_question WHERE custom_topic_id = :t").param("t", topicId).update();
    }

    @Override
    public boolean delete(UUID ownerId, UUID topicId) {
        return jdbc.sql("DELETE FROM custom_topic WHERE id = :id AND owner_user_id = :o").param("id", topicId).param("o", ownerId).update() > 0;
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
