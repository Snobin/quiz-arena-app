package in.minnal.core.question.infrastructure;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Player question reports (Story 3.5): create only; closing is Story 3.6. */
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
}
