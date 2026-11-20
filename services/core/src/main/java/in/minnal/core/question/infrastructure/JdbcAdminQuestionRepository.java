package in.minnal.core.question.infrastructure;

import in.minnal.core.question.application.AdminQuestionPage;
import in.minnal.core.question.application.AdminQuestionQuery;
import in.minnal.core.question.application.AdminQuestionRow;
import in.minnal.core.question.application.AdminSubject;
import java.sql.Array;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Read-only admin views of the question bank (Story 3.1). */
@Repository
public class JdbcAdminQuestionRepository {

    private final JdbcClient jdbc;

    public JdbcAdminQuestionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public AdminQuestionPage list(AdminQuestionQuery q) {
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new LinkedHashMap<>();
        if (q.state() != null) {
            where.append(" AND state = :state");
            params.put("state", q.state());
        }
        if (q.category() != null) {
            where.append(" AND category = :category");
            params.put("category", q.category());
        }
        if (q.subjectId() != null) {
            where.append(" AND subject_id = :subjectId");
            params.put("subjectId", q.subjectId());
        }
        if (q.topicId() != null) {
            where.append(" AND topic_id = :topicId");
            params.put("topicId", q.topicId());
        }
        if (q.examLevel() != null) {
            where.append(" AND exam_level = :examLevel");
            params.put("examLevel", q.examLevel());
        }
        if (q.difficulty() != null) {
            where.append(" AND difficulty = :difficulty");
            params.put("difficulty", q.difficulty());
        }
        if (q.search() != null) {
            where.append(" AND (text_ml ILIKE :pattern OR text_en ILIKE :pattern)");
            params.put("pattern", "%" + q.search().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        String sql = """
                WITH shown AS (
                    SELECT DISTINCT ON (question_id) *
                    FROM question_version
                    ORDER BY question_id, (status = 'PUBLISHED') DESC, version DESC
                ), base AS (
                    SELECT q.id AS question_id, q.display_no, s.version, s.content_category AS category,
                           s.subject_id, s.topic_id, s.exam_level, s.difficulty, s.text_ml, s.text_en,
                           s.options, s.answer_index, s.explanation,
                           sub.name AS subject_name, t.name AS topic_name,
                           EXISTS (SELECT 1 FROM question_version d WHERE d.question_id = q.id AND d.status = 'DRAFT') AS has_draft,
                           (SELECT max(d.version) FROM question_version d WHERE d.question_id = q.id AND d.status = 'DRAFT') AS draft_version,
                           (SELECT max(created_at) FROM question_version a WHERE a.question_id = q.id) AS updated_at,
                           CASE WHEN q.deleted_at IS NOT NULL THEN 'DELETED'
                                WHEN s.status = 'PUBLISHED' THEN 'PUBLISHED'
                                WHEN EXISTS (SELECT 1 FROM question_version d WHERE d.question_id = q.id AND d.status = 'DRAFT') THEN 'DRAFT'
                                ELSE 'DISCARDED' END AS state
                    FROM question q
                    JOIN shown s ON s.question_id = q.id
                    JOIN subject sub ON sub.id = s.subject_id
                    JOIN topic t ON t.id = s.topic_id
                )
                SELECT * FROM base""" + where
                + " ORDER BY updated_at DESC, display_no DESC LIMIT :limit OFFSET :offset";
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("limit", q.size()).param("offset", (long) q.page() * q.size());
        for (Map.Entry<String, Object> e : params.entrySet()) {
            spec = spec.param(e.getKey(), e.getValue());
        }
        List<AdminQuestionRow> rows = spec.query((rs, i) -> {
            Array options = rs.getArray("options");
            List<String> optionList;
            try {
                optionList = List.of((String[]) options.getArray());
            } catch (SQLException ex) {
                throw new IllegalStateException(ex);
            }
            return new AdminQuestionRow(rs.getObject("question_id", UUID.class), rs.getLong("display_no"), rs.getInt("version"),
                    rs.getString("state"), rs.getBoolean("has_draft"), rs.getObject("draft_version", Integer.class), rs.getString("text_ml"), rs.getString("text_en"),
                    rs.getString("category"), rs.getString("subject_name"), rs.getString("topic_name"),
                    rs.getObject("subject_id", UUID.class), rs.getObject("topic_id", UUID.class),
                    rs.getString("exam_level"), rs.getString("difficulty"), optionList, rs.getInt("answer_index"),
                    rs.getString("explanation"), rs.getObject("updated_at", java.time.OffsetDateTime.class).toInstant());
        }).list();
        String countSql = sql.substring(0, sql.indexOf(" ORDER BY updated_at")).replace("SELECT * FROM base", "SELECT count(*) FROM base");
        long totalItems = jdbc.sql(countSql).params(params).query(Long.class).single();
        return new AdminQuestionPage(rows, q.page(), q.size(), totalItems);
    }

    public List<AdminSubject> subjects() {
        Map<UUID, List<AdminSubject.Topic>> topics = new LinkedHashMap<>();
        jdbc.sql("SELECT id, subject_id, name FROM topic ORDER BY lower(name), id").query((rs, i) -> {
            topics.computeIfAbsent(rs.getObject("subject_id", UUID.class), k -> new ArrayList<>())
                    .add(new AdminSubject.Topic(rs.getObject("id", UUID.class), rs.getString("name")));
            return null;
        }).list();
        return jdbc.sql("SELECT id, name FROM subject ORDER BY lower(name), id").query((rs, i) -> {
            UUID id = rs.getObject("id", UUID.class);
            return new AdminSubject(id, rs.getString("name"), topics.getOrDefault(id, List.of()));
        }).list();
    }
}
