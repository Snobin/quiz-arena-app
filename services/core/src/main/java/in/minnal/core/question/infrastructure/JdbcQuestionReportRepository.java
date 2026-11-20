package in.minnal.core.question.infrastructure;

import in.minnal.core.question.application.AdminReportPage;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Player question reports: created by Story 3.5, read and closed by Story 3.6. Reports are never deleted. */
@Repository
public class JdbcQuestionReportRepository {

    private final JdbcClient jdbc;

    public JdbcQuestionReportRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public boolean isPublishedVersion(UUID questionId, int version) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM question_version WHERE question_id = :q AND version = :v AND status = 'PUBLISHED')")
                .param("q", questionId).param("v", version).query(Boolean.class).single();
    }

    public void insert(UUID id, UUID questionId, int version, UUID reporterId, String note, String surface, String matchId, Instant at) {
        jdbc.sql("""
                INSERT INTO question_report (id, question_id, version, reporter_id, note, surface, match_id, status, created_at)
                VALUES (:id, :q, :v, :r, :note, :surface, :match, 'OPEN', :at)""")
                .param("id", id).param("q", questionId).param("v", version).param("r", reporterId)
                .param("note", note).param("surface", surface).param("match", matchId).param("at", Timestamp.from(at))
                .update();
    }

    public long openCount() {
        return jdbc.sql("SELECT count(*) FROM question_report WHERE status = 'OPEN'").query(Long.class).single();
    }

    /** Every OPEN report on a version lower than {@code newVersion} becomes RESOLVED_FIXED. Runs in the publish transaction. */
    public int resolveOlderOpen(UUID questionId, int newVersion, UUID actor, Instant now) {
        return jdbc.sql("""
                UPDATE question_report SET status = 'RESOLVED_FIXED', fixed_by_version = :nv, resolved_by = :actor, resolved_at = :now
                WHERE question_id = :q AND version < :nv AND status = 'OPEN'""")
                .param("nv", newVersion).param("actor", actor).param("now", Timestamp.from(now)).param("q", questionId).update();
    }

    /** Dismisses every OPEN report on one version; returns how many were open. */
    public int dismiss(UUID questionId, int version, String note, UUID actor, Instant now) {
        return jdbc.sql("""
                UPDATE question_report SET status = 'DISMISSED', resolution_note = :note, resolved_by = :actor, resolved_at = :now
                WHERE question_id = :q AND version = :v AND status = 'OPEN'""")
                .param("note", note).param("actor", actor).param("now", Timestamp.from(now)).param("q", questionId).param("v", version).update();
    }

    /** Dismisses every OPEN report on a question, all versions (the question was deleted). */
    public int dismissAllForQuestion(UUID questionId, String note, UUID actor, Instant now) {
        return jdbc.sql("""
                UPDATE question_report SET status = 'DISMISSED', resolution_note = :note, resolved_by = :actor, resolved_at = :now
                WHERE question_id = :q AND status = 'OPEN'""")
                .param("note", note).param("actor", actor).param("now", Timestamp.from(now)).param("q", questionId).update();
    }

    private record Key(UUID questionId, int version) {
    }

    private record GroupRow(Key key, int count, Instant first, Instant last) {
    }

    /** One page of groups. {@code open} picks OPEN reports, otherwise closed ones; {@code questionId} narrows to one question. */
    public AdminReportPage page(boolean open, UUID questionId, int page, int size) {
        String where = (open ? "status = 'OPEN'" : "status <> 'OPEN'") + (questionId == null ? "" : " AND question_id = :qid");
        String order = open ? "cnt DESC, first_at ASC, question_id, version" : "last_resolved DESC, question_id, version";
        JdbcClient.StatementSpec count = jdbc.sql("SELECT count(*) FROM (SELECT 1 FROM question_report WHERE " + where + " GROUP BY question_id, version) g");
        JdbcClient.StatementSpec groups = jdbc.sql("SELECT question_id, version, count(*) AS cnt, min(created_at) AS first_at, max(created_at) AS last_at,"
                + " max(resolved_at) AS last_resolved FROM question_report WHERE " + where
                + " GROUP BY question_id, version ORDER BY " + order + " LIMIT :limit OFFSET :offset");
        if (questionId != null) {
            count = count.param("qid", questionId);
            groups = groups.param("qid", questionId);
        }
        long total = count.query(Long.class).single();
        List<GroupRow> rows = groups.param("limit", size).param("offset", (long) page * size)
                .query((rs, i) -> new GroupRow(new Key(rs.getObject("question_id", UUID.class), rs.getInt("version")), rs.getInt("cnt"),
                        instant(rs, "first_at"), instant(rs, "last_at"))).list();
        if (rows.isEmpty()) {
            return new AdminReportPage(List.of(), page, size, total);
        }
        List<UUID> ids = rows.stream().map(r -> r.key().questionId()).distinct().toList();

        record Info(long displayNo, Integer current, Integer draft) {
        }
        Map<UUID, Info> info = new HashMap<>();
        jdbc.sql("""
                SELECT q.id, q.display_no,
                  (SELECT max(version) FROM question_version v WHERE v.question_id = q.id AND v.status = 'PUBLISHED') AS cur,
                  (SELECT max(version) FROM question_version v WHERE v.question_id = q.id AND v.status = 'DRAFT') AS draft
                FROM question q WHERE q.id IN (:ids)""").param("ids", ids)
                .query((rs, i) -> {
                    info.put(rs.getObject("id", UUID.class), new Info(rs.getLong("display_no"), (Integer) rs.getObject("cur"), (Integer) rs.getObject("draft")));
                    return null;
                }).list();
        Map<Key, String[]> texts = new HashMap<>();
        jdbc.sql("SELECT question_id, version, text_ml, text_en FROM question_version WHERE question_id IN (:ids)").param("ids", ids)
                .query((rs, i) -> {
                    texts.put(new Key(rs.getObject("question_id", UUID.class), rs.getInt("version")),
                            new String[]{rs.getString("text_ml"), rs.getString("text_en")});
                    return null;
                }).list();

        Map<Key, List<AdminReportPage.Report>> reports = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT r.id, r.question_id, r.version, r.note, r.surface, r.created_at, r.status, r.resolved_at, r.resolution_note,
                  r.fixed_by_version,
                  CASE WHEN u.status = 'DELETED' THEN 'Deleted player' ELSE coalesce(p.display_name, 'Player') END AS reporter_name,
                  CASE WHEN r.resolved_by IS NULL THEN NULL ELSE coalesce(a.given_name, a.email, 'Admin') END AS closer
                FROM question_report r
                LEFT JOIN app_user u ON u.id = r.reporter_id
                LEFT JOIN user_profile p ON p.user_id = r.reporter_id
                LEFT JOIN app_user a ON a.id = r.resolved_by
                WHERE r.question_id IN (:ids) AND r.status """ + (open ? "= 'OPEN'" : "<> 'OPEN'") + " ORDER BY r.created_at, r.id")
                .param("ids", ids)
                .query((rs, i) -> {
                    reports.computeIfAbsent(new Key(rs.getObject("question_id", UUID.class), rs.getInt("version")), k -> new ArrayList<>())
                            .add(report(rs));
                    return null;
                }).list();

        List<AdminReportPage.Group> items = new ArrayList<>();
        for (GroupRow r : rows) {
            Info in = info.get(r.key().questionId());
            String[] text = texts.getOrDefault(r.key(), new String[]{null, null});
            items.add(new AdminReportPage.Group(r.key().questionId(), in == null ? 0 : in.displayNo(), r.key().version(), text[0], text[1],
                    in == null ? null : in.current(), in == null ? null : in.draft(), r.count(), r.first(), r.last(),
                    reports.getOrDefault(r.key(), List.of())));
        }
        return new AdminReportPage(items, page, size, total);
    }

    private static AdminReportPage.Report report(ResultSet rs) throws SQLException {
        return new AdminReportPage.Report(rs.getObject("id", UUID.class), rs.getString("note"), rs.getString("reporter_name"),
                rs.getString("surface"), instant(rs, "created_at"), rs.getString("status"), rs.getString("closer"),
                instant(rs, "resolved_at"), rs.getString("resolution_note"), (Integer) rs.getObject("fixed_by_version"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
