package in.minnal.core.question.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.question.infrastructure.JdbcQuestionReportRepository;
import in.minnal.core.support.PostgresIntegrationTest;
import in.minnal.core.support.QuestionFixtures;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@TestPropertySource(properties = {"minnal.auth.admin-emails=boss@example.com", "minnal.auth.web-url=http://localhost:5173"})
class AdminReportIntegrationTest extends PostgresIntegrationTest {

    static final String REPORTS = "/api/core/v1/admin/reports";
    static final String QUESTIONS = "/api/core/v1/admin/questions";

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired QuestionFixtures fixtures;
    @MockitoSpyBean JdbcQuestionReportRepository reportsSpy;

    UUID adminId;

    String admin() {
        adminId = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', 'boss@example.com', 'Boss', :t, :t)")
                .param("id", adminId).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(adminId, "boss@example.com", "Boss"), "en").accessToken();
    }

    String player() {
        return "Bearer " + userTokens.issue(new Account(newUser("ACTIVE", "x@example.com", null), null, "P"), "en").accessToken();
    }

    UUID newUser(String status, String email, String displayName) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, :s, :e, 'Given', :t, :t)")
                .param("id", id).param("s", status).param("e", email).param("t", Timestamp.from(Instant.now())).update();
        if (displayName != null) {
            jdbc.sql("INSERT INTO user_profile (user_id, display_name, district, exam_level, language, updated_at) VALUES (:id, :n, 'Kollam', 'DEGREE', 'en', :t)")
                    .param("id", id).param("n", displayName).param("t", Timestamp.from(Instant.now())).update();
        }
        return id;
    }

    void report(QuestionVersion v, UUID reporter, String note, Instant at) {
        jdbc.sql("INSERT INTO question_report (id, question_id, version, reporter_id, note, surface, status, created_at) VALUES (:id, :q, :v, :r, :n, 'RESULTS', 'OPEN', :t)")
                .param("id", UUID.randomUUID()).param("q", v.questionId()).param("v", v.version()).param("r", reporter).param("n", note)
                .param("t", Timestamp.from(at)).update();
    }

    ResultActions send(MockHttpServletRequestBuilder b, String auth, String json) throws Exception {
        if (auth != null) {
            b.header("Authorization", auth);
        }
        if (json != null) {
            b.contentType(MediaType.APPLICATION_JSON).content(json);
        }
        return mvc.perform(b);
    }

    String statusOfReports(UUID questionId) {
        return String.join(",", jdbc.sql("SELECT status FROM question_report WHERE question_id = :q ORDER BY version, created_at").param("q", questionId)
                .query(String.class).list());
    }

    QuestionVersion fix(QuestionVersion v1, QuestionFixtures.Placement p, String text) {
        QuestionVersion next = v1.nextDraft(fixtures.content(p, ContentCategory.KERALA_PSC, ExamLevel.TENTH, text), Instant.now());
        fixtures.insertVersion(next);
        return next;
    }

    String publishUrl(QuestionVersion v) {
        return QUESTIONS + "/" + v.questionId() + "/versions/" + v.version() + "/publish";
    }

    String dismissBody(QuestionVersion v, String note) {
        return "{\"questionId\":\"" + v.questionId() + "\",\"version\":" + v.version() + (note == null ? "" : ",\"note\":\"" + note + "\"") + "}";
    }

    @Test
    void authMatrix() throws Exception {
        String guest = "Bearer " + guestTokens.issue("en").accessToken();
        String user = player();
        for (var request : List.<java.util.function.Supplier<MockHttpServletRequestBuilder>>of(
                () -> get(REPORTS), () -> get(REPORTS + "/summary"), () -> post(REPORTS + "/dismiss"))) {
            send(request.get(), null, "{}").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401));
            send(request.get(), user, "{}").andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
            send(request.get(), guest, "{}").andExpect(status().isForbidden());
        }
    }

    @Test
    void openQueueGroupsPerVersionMostReportedFirstWithTagsAndReporterNames() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion one = fixtures.published(p, "One");
        QuestionVersion two = fixtures.published(p, "Two");
        QuestionVersion fixedDraft = fix(two, p, "Two fixed");
        Instant t = Instant.now().minusSeconds(1000);
        UUID named = newUser("ACTIVE", "secret@example.com", "Anju");
        UUID deleted = newUser("DELETED", "gone@example.com", "Hidden");
        UUID noProfile = newUser("ACTIVE", "plain@example.com", null);
        report(one, named, "wrong answer", t);
        report(two, deleted, null, t.plusSeconds(10));
        report(two, noProfile, "<b>bad</b>", t.plusSeconds(20));
        String json = send(get(REPORTS + "?status=OPEN"), a, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.items[0].questionId").value(two.questionId().toString()))
                .andExpect(jsonPath("$.items[0].reportCount").value(2))
                .andExpect(jsonPath("$.items[0].pendingDraftVersion").value(fixedDraft.version()))
                .andExpect(jsonPath("$.items[0].currentPublishedVersion").value(1))
                .andExpect(jsonPath("$.items[0].textEn").value("Two"))
                .andExpect(jsonPath("$.items[0].reports[0].reporterName").value("Deleted player"))
                .andExpect(jsonPath("$.items[0].reports[1].reporterName").value("Player"))
                .andExpect(jsonPath("$.items[0].reports[1].note").value("<b>bad</b>"))
                .andExpect(jsonPath("$.items[1].reports[0].reporterName").value("Anju"))
                .andReturn().getResponse().getContentAsString();
        assertThat(json).doesNotContain("example.com").doesNotContain(named.toString()).doesNotContain("reporterId");
        send(get(REPORTS + "/summary"), a, null).andExpect(jsonPath("$.openCount").value(3));
        send(get(REPORTS + "?questionId=" + one.questionId()), a, null).andExpect(jsonPath("$.totalItems").value(1));
        send(get(REPORTS + "?status=NOPE"), a, null).andExpect(status().isBadRequest());
        send(get(REPORTS + "?size=500"), a, null).andExpect(jsonPath("$.size").value(100));
    }

    @Test
    void discardingAFixDraftLeavesReportsOpenAndPublishingResolvesOlderVersionsOnly() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion v1 = fixtures.published(p, "Old");
        UUID r1 = newUser("ACTIVE", null, "Anju");
        UUID r2 = newUser("ACTIVE", null, "Binu");
        report(v1, r1, "n1", Instant.now().minusSeconds(60));
        QuestionVersion v2 = fix(v1, p, "Second");
        send(post(QUESTIONS + "/" + v2.questionId() + "/versions/2/discard"), a, null).andExpect(status().isOk());
        assertThat(statusOfReports(v1.questionId())).isEqualTo("OPEN");

        QuestionVersion v3 = v2.nextDraft(fixtures.content(p, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "Third"), Instant.now());
        fixtures.insertVersion(v3);
        send(post(publishUrl(v3)), a, null).andExpect(status().isOk());
        assertThat(statusOfReports(v1.questionId())).isEqualTo("RESOLVED_FIXED");
        var row = jdbc.sql("SELECT fixed_by_version, resolved_by FROM question_report WHERE reporter_id = :r").param("r", r1)
                .query((rs, n) -> new Object[]{rs.getInt(1), rs.getObject(2, UUID.class)}).single();
        assertThat(row[0]).isEqualTo(3);
        assertThat(row[1]).isEqualTo(adminId);

        // A report on the now-superseded v1 stays OPEN until the next publish.
        report(v1, r2, null, Instant.now());
        assertThat(statusOfReports(v1.questionId())).isEqualTo("RESOLVED_FIXED,OPEN");
        // A report on the published version itself is not resolved by an older publish.
        QuestionVersion v4 = v3.nextDraft(fixtures.content(p, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "Fourth"), Instant.now());
        fixtures.insertVersion(v4);
        send(post(publishUrl(v4)), a, null).andExpect(status().isOk());
        assertThat(statusOfReports(v1.questionId())).isEqualTo("RESOLVED_FIXED,RESOLVED_FIXED");
        send(get(REPORTS + "?status=CLOSED"), a, null).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].reportCount").value(2))
                .andExpect(jsonPath("$.items[0].reports[0].status").value("RESOLVED_FIXED"))
                .andExpect(jsonPath("$.items[0].reports[0].fixedByVersion").exists())
                .andExpect(jsonPath("$.items[0].reports[0].resolvedBy").value("Boss"));
        send(get(REPORTS + "?status=OPEN"), a, null).andExpect(jsonPath("$.totalItems").value(0));
    }

    @Test
    void aFailedPublishLeavesReportsOpen() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion v1 = fixtures.published(p, "Old");
        report(v1, newUser("ACTIVE", null, "Anju"), "n", Instant.now());
        QuestionVersion v2 = fix(v1, p, "Bad");
        jdbc.sql("UPDATE question_version SET text_en = :t WHERE id = :id").param("t", "x".repeat(1001)).param("id", v2.id()).update();
        send(post(publishUrl(v2)), a, null).andExpect(status().isBadRequest());
        assertThat(statusOfReports(v1.questionId())).isEqualTo("OPEN");
    }

    /** Pins the same-transaction rule in AdminDraftService.publishInTransaction: a failure after publishDraft rolls the publish back. */
    @Test
    void aFailureWhileResolvingReportsRollsTheWholePublishBack() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion v1 = fixtures.published(p, "Old");
        report(v1, newUser("ACTIVE", null, "Anju"), "n", Instant.now());
        QuestionVersion v2 = fix(v1, p, "Fixed");
        doThrow(new IllegalStateException("injected")).when(reportsSpy).resolveOlderOpen(any(), anyInt(), any(), any());
        try {
            // MockMvc rethrows an unhandled exception instead of rendering a 500.
            assertThatThrownBy(() -> send(post(publishUrl(v2)), a, null)).hasMessageContaining("injected");
        } finally {
            org.mockito.Mockito.reset(reportsSpy);
        }
        assertThat(jdbc.sql("SELECT status FROM question_version WHERE id = :id").param("id", v2.id()).query(String.class).single()).isEqualTo("DRAFT");
        assertThat(statusOfReports(v1.questionId())).isEqualTo("OPEN");
    }

    @Test
    void dismissClosesOneVersionWithTheNoteAndValidates() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion v1 = fixtures.published(p, "Old");
        UUID r = newUser("ACTIVE", null, "Anju");
        report(v1, r, "n", Instant.now());
        report(v1, newUser("ACTIVE", null, "Binu"), "m", Instant.now());
        send(post(REPORTS + "/dismiss"), a, dismissBody(v1, null)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='note')]").exists());
        send(post(REPORTS + "/dismiss"), a, dismissBody(v1, "   ")).andExpect(status().isBadRequest());
        send(post(REPORTS + "/dismiss"), a, dismissBody(v1, "x".repeat(501))).andExpect(status().isBadRequest());
        send(post(REPORTS + "/dismiss"), a, null).andExpect(status().isBadRequest());
        assertThat(statusOfReports(v1.questionId())).isEqualTo("OPEN,OPEN");
        send(post(REPORTS + "/dismiss"), a, dismissBody(v1, "Answer is right")).andExpect(status().isOk()).andExpect(jsonPath("$.dismissed").value(2));
        assertThat(statusOfReports(v1.questionId())).isEqualTo("DISMISSED,DISMISSED");
        send(post(REPORTS + "/dismiss"), a, dismissBody(v1, "again")).andExpect(status().isConflict());
        send(get(REPORTS + "?status=CLOSED"), a, null).andExpect(jsonPath("$.items[0].reports[0].status").value("DISMISSED"))
                .andExpect(jsonPath("$.items[0].reports[0].resolutionNote").value("Answer is right"))
                .andExpect(jsonPath("$.items[0].reports[0].resolvedBy").value("Boss"));
    }

    @Test
    void deleteDismissesOpenReportsAndRestoreDoesNotReopenThem() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion v1 = fixtures.published(p, "Doomed");
        report(v1, newUser("ACTIVE", null, "Anju"), "n", Instant.now());
        send(delete(QUESTIONS + "/" + v1.questionId()), a, null).andExpect(status().is2xxSuccessful());
        assertThat(statusOfReports(v1.questionId())).isEqualTo("DISMISSED");
        assertThat(jdbc.sql("SELECT resolution_note || '|' || resolved_by FROM question_report").query(String.class).single())
                .isEqualTo("Question deleted|" + adminId);
        send(post(QUESTIONS + "/" + v1.questionId() + "/restore"), a, null).andExpect(status().is2xxSuccessful());
        assertThat(statusOfReports(v1.questionId())).isEqualTo("DISMISSED");
        assertThat(jdbc.sql("SELECT count(*) FROM question_report").query(Integer.class).single()).isEqualTo(1);
    }
}
