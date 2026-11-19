package in.minnal.core.question.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.minnal.core.support.PostgresIntegrationTest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

class MigrationIntegrationTest extends PostgresIntegrationTest {

    @Test
    void createsTheQuestionBankAndAccountTables() {
        List<String> tables = jdbc.sql("SELECT table_name FROM information_schema.tables WHERE table_schema = 'core' ORDER BY 1")
                .query(String.class).list();
        assertThat(tables).containsExactly("app_user", "event_outbox", "flyway_schema_history", "question", "question_version",
                "refresh_token", "subject", "topic", "user_identity", "user_profile");
    }

    @Test
    void profileAndOutboxTablesHoldOnlyTheirStoryColumns() {
        assertThat(columns("user_profile")).containsExactlyInAnyOrderEntriesOf(Map.of(
                "user_id", "uuid", "display_name", "text", "district", "text", "exam_level", "text",
                "language", "text", "updated_at", "timestamp with time zone"));
        assertThat(columns("event_outbox")).containsExactlyInAnyOrderEntriesOf(Map.of(
                "id", "bigint", "stream", "text", "payload", "jsonb", "created_at", "timestamp with time zone",
                "published_at", "timestamp with time zone", "attempts", "integer"));
    }

    @Test
    void accountTablesHoldOnlyTheirStoryColumnsAndHashedRefreshTokens() {
        assertThat(columns("app_user")).containsExactlyInAnyOrderEntriesOf(Map.of(
                "id", "uuid", "status", "text", "email", "text", "given_name", "text",
                "created_at", "timestamp with time zone", "last_sign_in_at", "timestamp with time zone"));
        assertThat(columns("user_identity")).containsExactlyInAnyOrderEntriesOf(Map.of(
                "provider", "text", "provider_subject", "text", "user_id", "uuid", "created_at", "timestamp with time zone"));
        assertThat(columns("refresh_token")).containsExactlyInAnyOrderEntriesOf(Map.of(
                "id", "uuid", "user_id", "uuid", "family_id", "uuid", "token_hash", "text",
                "expires_at", "timestamp with time zone", "created_at", "timestamp with time zone",
                "rotated_at", "timestamp with time zone", "revoked_at", "timestamp with time zone"));
    }

    @Test
    void questionHoldsExactlyItsIdentityColumns() {
        assertThat(columns("question")).containsExactlyInAnyOrderEntriesOf(Map.of(
                "id", "uuid", "source_ref", "text", "created_at", "timestamp with time zone", "deleted_at", "timestamp with time zone"));
    }

    @Test
    void questionVersionHoldsEveryStoryColumn() {
        assertThat(columns("question_version")).containsExactlyInAnyOrderEntriesOf(Map.ofEntries(
                Map.entry("id", "uuid"), Map.entry("question_id", "uuid"), Map.entry("version", "integer"),
                Map.entry("status", "text"), Map.entry("content_category", "text"), Map.entry("subject_id", "uuid"),
                Map.entry("topic_id", "uuid"), Map.entry("exam_level", "text"), Map.entry("difficulty", "text"),
                Map.entry("text_ml", "text"), Map.entry("text_en", "text"), Map.entry("options", "ARRAY"),
                Map.entry("answer_index", "smallint"), Map.entry("explanation", "text"), Map.entry("attribution", "text"),
                Map.entry("reviewed_by", "text"), Map.entry("reviewed_at", "timestamp with time zone"),
                Map.entry("created_at", "timestamp with time zone")));
    }

    @Test
    void sourceRefIsUniqueOnlyWhenPresent() {
        insertQuestion("ref-1");
        insertQuestion(null);
        insertQuestion(null);
        assertThatThrownBy(() -> insertQuestion("ref-1")).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void subjectNamesAreUniqueIgnoringCase() {
        insertSubject("Kerala Geography");
        assertThatThrownBy(() -> insertSubject("KERALA GEOGRAPHY")).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void versionChecksRejectBadRows() {
        UUID question = insertQuestion(null);
        UUID subject = insertSubject("S");
        UUID topic = jdbc.sql("INSERT INTO topic (id, subject_id, name, created_at) VALUES (gen_random_uuid(), :s, 'T', now()) RETURNING id")
                .param("s", subject).query(UUID.class).single();

        // A valid row is accepted; then each broken column is rejected.
        assertThat(insertVersion(question, subject, topic, Map.of())).isEqualTo(1);
        Map<String, Map<String, String>> broken = Map.ofEntries(
                Map.entry("three options", Map.of("version", "2", "options", "ARRAY['a','b','c']")),
                Map.entry("null option", Map.of("version", "3", "options", "ARRAY['a','b','c',NULL]")),
                Map.entry("blank option", Map.of("version", "4", "options", "ARRAY['a',' ','c','d']")),
                Map.entry("answer index 4", Map.of("version", "5", "answer_index", "4")),
                Map.entry("unknown status", Map.of("version", "6", "status", "'LIVE'")),
                Map.entry("unknown category", Map.of("version", "7", "content_category", "'PSC'")),
                Map.entry("unknown exam level", Map.of("version", "8", "exam_level", "'PLUS_TWO'")),
                Map.entry("unknown difficulty", Map.of("version", "9", "difficulty", "'TRIVIAL'")),
                Map.entry("duplicate version", Map.of("version", "1", "status", "'DRAFT'")),
                Map.entry("version 0", Map.of("version", "0")),
                Map.entry("no text in either language", Map.of("version", "10", "text_en", "NULL")),
                Map.entry("blank explanation", Map.of("version", "11", "explanation", "'  '")),
                Map.entry("published without reviewer", Map.of("version", "12", "reviewed_by", "NULL")),
                Map.entry("published without review time", Map.of("version", "13", "reviewed_at", "NULL")));
        broken.forEach((name, overrides) -> assertThatThrownBy(() -> insertVersion(question, subject, topic, overrides))
                .as(name).isInstanceOf(DataIntegrityViolationException.class));

        // An unreviewed version is fine while it is a draft.
        assertThat(insertVersion(question, subject, topic, Map.of("version", "14", "status", "'DRAFT'", "reviewed_by", "NULL", "reviewed_at", "NULL"))).isEqualTo(1);
    }

    private int insertVersion(UUID question, UUID subject, UUID topic, Map<String, String> overrides) {
        Map<String, String> values = new java.util.LinkedHashMap<>();
        values.put("id", "gen_random_uuid()");
        values.put("question_id", ":q");
        values.put("version", "1");
        values.put("status", "'PUBLISHED'");
        values.put("content_category", "'KERALA_PSC'");
        values.put("subject_id", ":s");
        values.put("topic_id", ":t");
        values.put("exam_level", "'TENTH'");
        values.put("difficulty", "'EASY'");
        values.put("text_ml", "NULL");
        values.put("text_en", "'en'");
        values.put("options", "ARRAY['a','b','c','d']");
        values.put("answer_index", "0");
        values.put("explanation", "'e'");
        values.put("reviewed_by", "'Snobin'");
        values.put("reviewed_at", "now()");
        values.put("created_at", "now()");
        values.putAll(overrides);
        String sql = "INSERT INTO question_version (" + String.join(", ", values.keySet()) + ") VALUES ("
                + String.join(", ", values.values()) + ")";
        return jdbc.sql(sql).param("q", question).param("s", subject).param("t", topic).update();
    }

    private Map<String, String> columns(String table) {
        return jdbc.sql("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'core' AND table_name = :t")
                .param("t", table)
                .query((rs, n) -> Map.entry(rs.getString(1), rs.getString(2)))
                .list().stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    private UUID insertQuestion(String sourceRef) {
        return jdbc.sql("INSERT INTO question (id, source_ref, created_at) VALUES (gen_random_uuid(), :r, now()) RETURNING id")
                .param("r", sourceRef).query(UUID.class).single();
    }

    private UUID insertSubject(String name) {
        return jdbc.sql("INSERT INTO subject (id, name, created_at) VALUES (gen_random_uuid(), :n, now()) RETURNING id")
                .param("n", name).query(UUID.class).single();
    }
}
