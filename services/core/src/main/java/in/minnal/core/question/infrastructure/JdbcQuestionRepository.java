package in.minnal.core.question.infrastructure;

import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.Difficulty;
import in.minnal.core.question.domain.DrawCriteria;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.ImmutableVersionException;
import in.minnal.core.question.domain.Question;
import in.minnal.core.question.domain.QuestionContent;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.domain.VersionStatus;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.support.AbstractSqlTypeValue;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Questions and their versions. A version is changed only while it is a {@code DRAFT}. */
@Repository
public class JdbcQuestionRepository {

    private static final String VERSION_COLUMNS = """
            id, question_id, version, status, content_category, subject_id, topic_id, exam_level, difficulty,
            text_ml, text_en, options, answer_index, explanation, attribution, reviewed_by, reviewed_at, created_at""";

    private final JdbcClient jdbc;

    public JdbcQuestionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** True when a question (live or soft-deleted) already has this source reference. */
    public boolean existsBySourceRef(String sourceRef) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM question WHERE source_ref = :sourceRef)")
                .param("sourceRef", sourceRef)
                .query(Boolean.class)
                .single();
    }

    public void insert(Question question) {
        jdbc.sql("INSERT INTO question (id, source_ref, created_at, deleted_at) VALUES (:id, :sourceRef, :createdAt, :deletedAt)")
                .param("id", question.id())
                .param("sourceRef", question.sourceRef())
                .param("createdAt", utc(question.createdAt()))
                .param("deletedAt", utc(question.deletedAt()))
                .update();
    }

    /** Soft delete: the question stays, but is never drawn again. */
    public void softDelete(UUID questionId, Instant now) {
        jdbc.sql("UPDATE question SET deleted_at = :now WHERE id = :id AND deleted_at IS NULL")
                .param("now", utc(now))
                .param("id", questionId)
                .update();
    }

    public void insertVersion(QuestionVersion version) {
        QuestionContent c = version.content();
        jdbc.sql("INSERT INTO question_version (" + VERSION_COLUMNS + """
                ) VALUES (:id, :questionId, :version, :status, :category, :subjectId, :topicId, :examLevel, :difficulty,
                          :textMl, :textEn, :options, :answerIndex, :explanation, :attribution, :reviewedBy, :reviewedAt, :createdAt)
                """)
                .param("id", version.id())
                .param("questionId", version.questionId())
                .param("version", version.version())
                .param("status", version.status().name())
                .param("category", c.category().name())
                .param("subjectId", c.subjectId())
                .param("topicId", c.topicId())
                .param("examLevel", c.examLevel().name())
                .param("difficulty", c.difficulty().name())
                .param("textMl", c.textMl())
                .param("textEn", c.textEn())
                .param("options", textArray(c.options()))
                .param("answerIndex", c.answerIndex())
                .param("explanation", c.explanation())
                .param("attribution", c.attribution())
                .param("reviewedBy", version.reviewedBy())
                .param("reviewedAt", utc(version.reviewedAt()))
                .param("createdAt", utc(version.createdAt()))
                .update();
    }

    /**
     * The only write path for an existing version. It updates the row only while it is a
     * {@code DRAFT} in the database; when no draft row matched (a published, discarded or missing
     * version) it throws and nothing changes.
     */
    public void updateDraft(QuestionVersion version) {
        QuestionContent c = version.content();
        int updated = jdbc.sql("""
                UPDATE question_version SET
                    status = :status, content_category = :category, subject_id = :subjectId, topic_id = :topicId,
                    exam_level = :examLevel, difficulty = :difficulty, text_ml = :textMl, text_en = :textEn,
                    options = :options, answer_index = :answerIndex, explanation = :explanation,
                    attribution = :attribution, reviewed_by = :reviewedBy, reviewed_at = :reviewedAt
                WHERE id = :id AND status = 'DRAFT'
                """)
                .param("id", version.id())
                .param("status", version.status().name())
                .param("category", c.category().name())
                .param("subjectId", c.subjectId())
                .param("topicId", c.topicId())
                .param("examLevel", c.examLevel().name())
                .param("difficulty", c.difficulty().name())
                .param("textMl", c.textMl())
                .param("textEn", c.textEn())
                .param("options", textArray(c.options()))
                .param("answerIndex", c.answerIndex())
                .param("explanation", c.explanation())
                .param("attribution", c.attribution())
                .param("reviewedBy", version.reviewedBy())
                .param("reviewedAt", utc(version.reviewedAt()))
                .update();
        if (updated == 0) {
            VersionStatus current = findVersion(version.id()).map(QuestionVersion::status).orElse(null);
            throw new ImmutableVersionException(version.id(), current);
        }
    }

    public Optional<QuestionVersion> findVersion(UUID versionId) {
        return jdbc.sql("SELECT " + VERSION_COLUMNS + " FROM question_version WHERE id = :id")
                .param("id", versionId)
                .query((rs, n) -> mapVersion(rs))
                .optional();
    }

    public List<QuestionVersion> findVersions(UUID questionId) {
        return jdbc.sql("SELECT " + VERSION_COLUMNS + " FROM question_version WHERE question_id = :questionId ORDER BY version")
                .param("questionId", questionId)
                .query((rs, n) -> mapVersion(rs))
                .list();
    }

    /**
     * A random draw in one query: each live question's latest {@code PUBLISHED} version, then the
     * filters, then {@code ORDER BY random() LIMIT count}. Returns at most {@code count} versions.
     */
    public List<QuestionVersion> drawPublished(DrawCriteria criteria) {
        StringBuilder sql = new StringBuilder("""
                WITH latest AS (
                    SELECT DISTINCT ON (qv.question_id) qv.*
                    FROM question_version qv
                    JOIN question q ON q.id = qv.question_id
                    WHERE q.deleted_at IS NULL AND qv.status = 'PUBLISHED'
                    ORDER BY qv.question_id, qv.version DESC
                )
                SELECT """).append(' ').append(VERSION_COLUMNS).append("""

                FROM latest
                WHERE content_category = :category""");
        if (criteria.subjectId() != null) {
            sql.append(" AND subject_id = :subjectId");
        }
        if (criteria.topicId() != null) {
            sql.append(" AND topic_id = :topicId");
        }
        if (criteria.examLevel() != null) {
            sql.append(" AND exam_level = :examLevel");
        }
        sql.append(" ORDER BY random() LIMIT :count");

        JdbcClient.StatementSpec statement = jdbc.sql(sql.toString())
                .param("category", criteria.category().name())
                .param("count", criteria.count());
        if (criteria.subjectId() != null) {
            statement = statement.param("subjectId", criteria.subjectId());
        }
        if (criteria.topicId() != null) {
            statement = statement.param("topicId", criteria.topicId());
        }
        if (criteria.examLevel() != null) {
            statement = statement.param("examLevel", criteria.examLevel().name());
        }
        return statement.query((rs, n) -> mapVersion(rs)).list();
    }

    private static QuestionVersion mapVersion(ResultSet rs) throws SQLException {
        String[] options = (String[]) rs.getArray("options").getArray();
        QuestionContent content = new QuestionContent(
                ContentCategory.valueOf(rs.getString("content_category")),
                rs.getObject("subject_id", UUID.class),
                rs.getObject("topic_id", UUID.class),
                ExamLevel.valueOf(rs.getString("exam_level")),
                Difficulty.valueOf(rs.getString("difficulty")),
                rs.getString("text_ml"),
                rs.getString("text_en"),
                Arrays.asList(options),
                rs.getInt("answer_index"),
                rs.getString("explanation"),
                rs.getString("attribution"));
        return new QuestionVersion(
                rs.getObject("id", UUID.class),
                rs.getObject("question_id", UUID.class),
                rs.getInt("version"),
                VersionStatus.valueOf(rs.getString("status")),
                content,
                rs.getString("reviewed_by"),
                instant(rs, "reviewed_at"),
                instant(rs, "created_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static OffsetDateTime utc(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }

    private static AbstractSqlTypeValue textArray(List<String> values) {
        String[] array = values.toArray(String[]::new);
        return new AbstractSqlTypeValue() {
            @Override
            protected Object createTypeValue(Connection connection, int sqlType, String typeName) throws SQLException {
                return connection.createArrayOf("text", array);
            }
        };
    }
}
