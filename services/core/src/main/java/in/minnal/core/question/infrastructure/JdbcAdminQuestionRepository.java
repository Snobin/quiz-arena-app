package in.minnal.core.question.infrastructure;

import in.minnal.core.question.application.AdminDraft;
import in.minnal.core.question.application.AdminDraftPage;
import in.minnal.core.question.application.AdminQuestionDetail;
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
import java.util.Optional;
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
                           s.published_at, s.discarded_at,
                           CASE WHEN s.published_by IS NOT NULL THEN coalesce(pu.given_name, pu.email, 'unknown')
                                WHEN s.status = 'PUBLISHED' THEN 'seed' END AS published_by_name,
                           CASE WHEN s.discarded_by IS NOT NULL THEN coalesce(du.given_name, du.email, 'unknown') END AS discarded_by_name,
                           sub.name AS subject_name, t.name AS topic_name,
                           EXISTS (SELECT 1 FROM question_version d WHERE d.question_id = q.id AND d.status = 'DRAFT') AS has_draft,
                           (SELECT max(d.version) FROM question_version d WHERE d.question_id = q.id AND d.status = 'DRAFT') AS draft_version,
                           (SELECT max(coalesce(a.updated_at, a.created_at)) FROM question_version a WHERE a.question_id = q.id) AS updated_at,
                           CASE WHEN q.deleted_at IS NOT NULL THEN 'DELETED'
                                WHEN s.status = 'PUBLISHED' THEN 'PUBLISHED'
                                WHEN EXISTS (SELECT 1 FROM question_version d WHERE d.question_id = q.id AND d.status = 'DRAFT') THEN 'DRAFT'
                                ELSE 'DISCARDED' END AS state
                    FROM question q
                    JOIN shown s ON s.question_id = q.id
                    JOIN subject sub ON sub.id = s.subject_id
                    JOIN topic t ON t.id = s.topic_id
                    LEFT JOIN app_user pu ON pu.id = s.published_by
                    LEFT JOIN app_user du ON du.id = s.discarded_by
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
                    rs.getString("explanation"), rs.getObject("updated_at", java.time.OffsetDateTime.class).toInstant(),
                    rs.getString("published_by_name"), instant(rs, "published_at"), rs.getString("discarded_by_name"), instant(rs, "discarded_at"));
        }).list();
        String countSql = sql.substring(0, sql.indexOf(" ORDER BY updated_at")).replace("SELECT * FROM base", "SELECT count(*) FROM base");
        long totalItems = jdbc.sql(countSql).params(params).query(Long.class).single();
        return new AdminQuestionPage(rows, q.page(), q.size(), totalItems);
    }


    private static final String CONTENT_COLUMNS = """
            %1$s.content_category, %1$s.subject_id, %1$s.topic_id, s.name AS subject_name, t.name AS topic_name,
            %1$s.exam_level, %1$s.difficulty, %1$s.text_ml, %1$s.text_en, %1$s.options, %1$s.answer_index,
            %1$s.explanation, %1$s.attribution""";

    private static AdminQuestionDetail.Content content(java.sql.ResultSet rs) throws SQLException {
        return new AdminQuestionDetail.Content(rs.getString("content_category"), rs.getObject("subject_id", UUID.class),
                rs.getObject("topic_id", UUID.class), rs.getString("subject_name"), rs.getString("topic_name"),
                rs.getString("exam_level"), rs.getString("difficulty"), rs.getString("text_ml"), rs.getString("text_en"),
                List.of((String[]) rs.getArray("options").getArray()), rs.getInt("answer_index"), rs.getString("explanation"),
                rs.getString("attribution"));
    }

    /** Story 3.4: every open draft of a live question, oldest first. */
    public AdminDraftPage drafts(String category, UUID subjectId, UUID topicId, int page, int size) {
        StringBuilder where = new StringBuilder(" WHERE v.status = 'DRAFT' AND q.deleted_at IS NULL");
        Map<String, Object> params = new LinkedHashMap<>();
        if (category != null) {
            where.append(" AND v.content_category = :category");
            params.put("category", category);
        }
        if (subjectId != null) {
            where.append(" AND v.subject_id = :subjectId");
            params.put("subjectId", subjectId);
        }
        if (topicId != null) {
            where.append(" AND v.topic_id = :topicId");
            params.put("topicId", topicId);
        }
        String from = " FROM question_version v JOIN question q ON q.id = v.question_id JOIN subject s ON s.id = v.subject_id"
                + " JOIN topic t ON t.id = v.topic_id LEFT JOIN app_user u ON u.id = v.created_by" + where;
        String sql = "SELECT v.question_id, q.display_no, v.version, v.row_version, v.created_at, v.created_by,"
                + " coalesce(u.given_name, u.email) AS creator, "
                + CONTENT_COLUMNS.formatted("v") + from
                + " ORDER BY v.created_at, q.display_no LIMIT :limit OFFSET :offset";
        JdbcClient.StatementSpec spec = jdbc.sql(sql).param("limit", size).param("offset", (long) page * size);
        for (Map.Entry<String, Object> e : params.entrySet()) {
            spec = spec.param(e.getKey(), e.getValue());
        }
        record Row(UUID questionId, long displayNo, int version, int rowVersion, AdminQuestionDetail.Content content,
                   String createdBy, Instant createdAt) {
        }
        List<Row> rows = spec.query((rs, i) -> new Row(rs.getObject("question_id", UUID.class), rs.getLong("display_no"),
                rs.getInt("version"), rs.getInt("row_version"), content(rs),
                rs.getObject("created_by") == null ? "seed" : orUnknown(rs.getString("creator")),
                instant(rs, "created_at"))).list();
        long total = jdbc.sql("SELECT count(*)" + from).params(params).query(Long.class).single();

        // The published version each draft replaces: the highest published version below the draft.
        Map<String, AdminQuestionDetail.Content> published = new java.util.HashMap<>();
        if (!rows.isEmpty()) {
            List<UUID> ids = rows.stream().map(Row::questionId).toList();
            jdbc.sql("SELECT v.question_id, v.version, " + CONTENT_COLUMNS.formatted("v")
                    + " FROM question_version v JOIN subject s ON s.id = v.subject_id JOIN topic t ON t.id = v.topic_id"
                    + " WHERE v.status = 'PUBLISHED' AND v.question_id IN (:ids) ORDER BY v.version")
                    .param("ids", ids)
                    .query((rs, i) -> {
                        // ascending, so the last one per question below the draft wins when matched later
                        published.put(rs.getObject("question_id", UUID.class) + ":" + rs.getInt("version"), content(rs));
                        return null;
                    }).list();
        }
        List<AdminDraft> items = new ArrayList<>();
        for (Row r : rows) {
            Integer replacesVersion = null;
            AdminQuestionDetail.Content base = null;
            for (int v = r.version() - 1; v >= 1; v--) {
                AdminQuestionDetail.Content c = published.get(r.questionId() + ":" + v);
                if (c != null) {
                    replacesVersion = v;
                    base = c;
                    break;
                }
            }
            items.add(new AdminDraft(r.questionId(), r.displayNo(), r.version(), r.rowVersion(), r.content(), r.createdBy(),
                    r.createdAt(), replacesVersion, base == null ? List.of() : AdminDraft.changedFields(base, r.content())));
        }
        return new AdminDraftPage(items, page, size, total);
    }

    public Optional<AdminQuestionDetail> detail(UUID questionId) {
        record Head(UUID id, long displayNo, String sourceRef, Instant deletedAt) {
        }
        Optional<Head> head = jdbc.sql("SELECT id, display_no, source_ref, deleted_at FROM question WHERE id = :id")
                .param("id", questionId)
                .query((rs, i) -> {
                    java.time.OffsetDateTime deleted = rs.getObject("deleted_at", java.time.OffsetDateTime.class);
                    return new Head(rs.getObject("id", UUID.class), rs.getLong("display_no"), rs.getString("source_ref"),
                            deleted == null ? null : deleted.toInstant());
                }).optional();
        if (head.isEmpty()) {
            return Optional.empty();
        }
        List<AdminQuestionDetail.HistoryEntry> history = jdbc.sql("""
                SELECT v.version, v.status, v.created_at, v.updated_at, v.created_by,
                       coalesce(u.given_name, u.email) AS creator,
                       v.published_by, v.published_at, coalesce(pu.given_name, pu.email) AS publisher,
                       v.discarded_by, v.discarded_at, coalesce(du.given_name, du.email) AS discarder
                FROM question_version v LEFT JOIN app_user u ON u.id = v.created_by
                     LEFT JOIN app_user pu ON pu.id = v.published_by
                     LEFT JOIN app_user du ON du.id = v.discarded_by
                WHERE v.question_id = :id ORDER BY v.version DESC""")
                .param("id", questionId)
                .query((rs, i) -> {
                    java.time.OffsetDateTime updated = rs.getObject("updated_at", java.time.OffsetDateTime.class);
                    String by = rs.getObject("created_by") == null ? "seed" : (rs.getString("creator") == null ? "unknown" : rs.getString("creator"));
                    String status = rs.getString("status");
                    String publishedBy = rs.getObject("published_by") != null ? orUnknown(rs.getString("publisher"))
                            : ("PUBLISHED".equals(status) ? "seed" : null);
                    String discardedBy = rs.getObject("discarded_by") != null ? orUnknown(rs.getString("discarder")) : null;
                    return new AdminQuestionDetail.HistoryEntry(rs.getInt("version"), status, by,
                            rs.getObject("created_at", java.time.OffsetDateTime.class).toInstant(), updated == null ? null : updated.toInstant(),
                            publishedBy, instant(rs, "published_at"), discardedBy, instant(rs, "discarded_at"));
                }).list();
        AdminQuestionDetail.Editing editing = jdbc.sql("""
                SELECT v.version, v.status, v.row_version, v.content_category, v.subject_id, v.topic_id, s.name AS subject_name,
                       t.name AS topic_name, v.exam_level, v.difficulty, v.text_ml, v.text_en, v.options, v.answer_index,
                       v.explanation, v.attribution
                FROM question_version v JOIN subject s ON s.id = v.subject_id JOIN topic t ON t.id = v.topic_id
                WHERE v.question_id = :id
                ORDER BY (v.status = 'DRAFT') DESC, (v.status = 'PUBLISHED') DESC, v.version DESC LIMIT 1""")
                .param("id", questionId)
                .query((rs, i) -> {
                    String[] options;
                    try {
                        options = (String[]) rs.getArray("options").getArray();
                    } catch (SQLException ex) {
                        throw new IllegalStateException(ex);
                    }
                    return new AdminQuestionDetail.Editing(rs.getInt("version"), rs.getString("status"), rs.getInt("row_version"),
                            new AdminQuestionDetail.Content(rs.getString("content_category"), rs.getObject("subject_id", UUID.class),
                                    rs.getObject("topic_id", UUID.class), rs.getString("subject_name"), rs.getString("topic_name"),
                                    rs.getString("exam_level"), rs.getString("difficulty"), rs.getString("text_ml"), rs.getString("text_en"),
                                    List.of(options), rs.getInt("answer_index"), rs.getString("explanation"), rs.getString("attribution")));
                }).optional().orElse(null);
        Head h = head.get();
        return Optional.of(new AdminQuestionDetail(h.id(), h.displayNo(), h.sourceRef(), h.deletedAt() != null, h.deletedAt(), editing, history));
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

    private static String orUnknown(String name) {
        return name == null ? "unknown" : name;
    }

    private static Instant instant(java.sql.ResultSet rs, String column) throws SQLException {
        java.time.OffsetDateTime value = rs.getObject(column, java.time.OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}
