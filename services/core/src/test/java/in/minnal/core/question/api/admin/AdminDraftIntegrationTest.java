package in.minnal.core.question.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.QuestionVersion;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@TestPropertySource(properties = {"minnal.auth.admin-emails=boss@example.com", "minnal.auth.web-url=http://localhost:5173"})
class AdminDraftIntegrationTest extends PostgresIntegrationTest {

    static final String QUESTIONS = "/api/core/v1/admin/questions";
    static final String DRAFTS = "/api/core/v1/admin/drafts";

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired QuestionFixtures fixtures;

    UUID adminId;

    String admin() {
        adminId = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', 'boss@example.com', 'Boss', :t, :t)")
                .param("id", adminId).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(adminId, "boss@example.com", "Boss"), "en").accessToken();
    }

    String player() {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', null, 'X', :t, :t)")
                .param("id", id).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(id, null, "P"), "en").accessToken();
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

    String served() throws Exception {
        return served(1);
    }

    String served(int count) throws Exception {
        return mvc.perform(post("/internal/question-sets").header("X-Internal-Token", "it-internal-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"source\":\"BANK\",\"filters\":{\"category\":\"KERALA_PSC\"},\"count\":" + count + ",\"requesterId\":\"p\"}"))
                .andReturn().getResponse().getContentAsString();
    }

    String statusOf(UUID questionId, int version) {
        return jdbc.sql("SELECT status FROM question_version WHERE question_id = :q AND version = :v").param("q", questionId).param("v", version)
                .query(String.class).single();
    }

    static String items(QuestionVersion... versions) {
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < versions.length; i++) {
            sb.append(i == 0 ? "" : ",").append("{\"questionId\":\"").append(versions[i].questionId()).append("\",\"version\":").append(versions[i].version()).append("}");
        }
        return sb.append("]}").toString();
    }

    String url(QuestionVersion v, String action) {
        return QUESTIONS + "/" + v.questionId() + "/versions/" + v.version() + "/" + action;
    }

    @Test
    void authMatrix() throws Exception {
        String id = UUID.randomUUID().toString();
        String guest = "Bearer " + guestTokens.issue("en").accessToken();
        String user = player();
        for (var request : List.<java.util.function.Supplier<MockHttpServletRequestBuilder>>of(
                () -> get(DRAFTS), () -> post(DRAFTS + "/publish"), () -> post(DRAFTS + "/discard"),
                () -> post(QUESTIONS + "/" + id + "/versions/1/publish"), () -> post(QUESTIONS + "/" + id + "/versions/1/discard"))) {
            send(request.get(), null, "{}").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401));
            send(request.get(), user, "{}").andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
            send(request.get(), guest, "{}").andExpect(status().isForbidden());
        }
    }

    @Test
    void publishingANewQuestionServesItFromTheNextCallAndRecordsTheActor() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion draft = fixtures.draft(p, "Longest river?");
        fixtures.published(p, "Filler");
        assertThat(served()).contains("Filler").doesNotContain("Longest river?");
        send(post(url(draft, "publish")), a, null).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
        assertThat(statusOf(draft.questionId(), 1)).isEqualTo("PUBLISHED");
        var row = jdbc.sql("SELECT published_by, published_at, reviewed_by, reviewed_at FROM question_version WHERE id = :id").param("id", draft.id())
                .query((rs, n) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2), rs.getString(3), rs.getObject(4)}).single();
        assertThat(row[0]).isEqualTo(adminId);
        assertThat(row[1]).isNotNull();
        assertThat(row[2]).isEqualTo(adminId.toString());
        assertThat(row[3]).isNotNull();
        assertThat(served(2)).contains("Longest river?").contains("Filler");
        send(get(QUESTIONS + "/" + draft.questionId()), a, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.versions[0].publishedBy").value("Boss")).andExpect(jsonPath("$.versions[0].publishedAt").exists());
    }

    QuestionVersion fixDraft(QuestionVersion v1, QuestionFixtures.Placement p, String text) {
        QuestionVersion v2 = v1.nextDraft(fixtures.content(p, ContentCategory.KERALA_PSC, ExamLevel.TENTH, text), Instant.now());
        fixtures.insertVersion(v2);
        return v2;
    }

    @Test
    void publishingAFixKeepsTheOldVersionUntouchedAndServesTheNewOne() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion v1 = fixtures.published(p, "Old wording");
        QuestionVersion v2 = fixDraft(v1, p, "New wording");
        String served = served();
        assertThat(served).contains("Old wording").doesNotContain("New wording");
        send(post(url(v2, "publish")), a, null).andExpect(status().isOk());
        assertThat(statusOf(v1.questionId(), 1)).isEqualTo("PUBLISHED");
        assertThat(jdbc.sql("SELECT text_en FROM question_version WHERE id = :id").param("id", v1.id()).query(String.class).single()).isEqualTo("Old wording");
        assertThat(jdbc.sql("SELECT published_by FROM question_version WHERE id = :id").param("id", v1.id()).query(UUID.class).optional()).isEmpty();
        served = served();
        assertThat(served).contains("New wording").doesNotContain("Old wording");
    }

    @Test
    void discardKeepsThePublishedVersionServingAndNeverServesADiscardedOnlyQuestion() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion v1 = fixtures.published(p, "Still live");
        QuestionVersion v2 = fixDraft(v1, p, "Rejected fix");
        QuestionVersion only = fixtures.draft(p, "Only draft");
        send(post(url(v2, "discard")), a, null).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DISCARDED"));
        send(post(url(only, "discard")), a, null).andExpect(status().isOk());
        assertThat(statusOf(v1.questionId(), 2)).isEqualTo("DISCARDED");
        var row = jdbc.sql("SELECT discarded_by, discarded_at FROM question_version WHERE id = :id").param("id", v2.id())
                .query((rs, n) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2)}).single();
        assertThat(row[0]).isEqualTo(adminId);
        assertThat(row[1]).isNotNull();
        String served = served();
        assertThat(served).contains("Still live").doesNotContain("Rejected fix").doesNotContain("Only draft");
        send(get(QUESTIONS + "/" + v1.questionId()), a, null).andExpect(jsonPath("$.versions[0].discardedBy").value("Boss"))
                .andExpect(jsonPath("$.versions[1].publishedBy").value("seed"));
    }

    @Test
    void notADraftOrDeletedOrUnknownChangesNothing() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion published = fixtures.published(p, "Live");
        QuestionVersion discarded = fixtures.discarded(p, "Gone");
        QuestionVersion deleted = fixtures.draft(p, "Deleted one");
        fixtures.softDelete(deleted.questionId());
        for (QuestionVersion v : List.of(published, discarded, deleted)) {
            send(post(url(v, "publish")), a, null).andExpect(status().isConflict()).andExpect(jsonPath("$.status").value(409));
            send(post(url(v, "discard")), a, null).andExpect(status().isConflict());
        }
        assertThat(statusOf(published.questionId(), 1)).isEqualTo("PUBLISHED");
        assertThat(statusOf(discarded.questionId(), 1)).isEqualTo("DISCARDED");
        assertThat(statusOf(deleted.questionId(), 1)).isEqualTo("DRAFT");
        send(post(QUESTIONS + "/" + UUID.randomUUID() + "/versions/1/publish"), a, null).andExpect(status().isNotFound());
        send(post(url(published, "publish").replace("/1/", "/9/")), a, null).andExpect(status().isNotFound());
        send(post(QUESTIONS + "/" + published.questionId() + "/versions/x/publish"), a, null).andExpect(status().isNotFound());
    }

    @Test
    void invalidStoredContentIsA400WithFieldErrorsAndNothingChanges() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion draft = fixtures.draft(p, "Too long");
        jdbc.sql("UPDATE question_version SET text_en = :t WHERE id = :id").param("t", "x".repeat(1001)).param("id", draft.id()).update();
        send(post(url(draft, "publish")), a, null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='textEn')]").exists());
        assertThat(statusOf(draft.questionId(), 1)).isEqualTo("DRAFT");
    }

    @Test
    void bulkAppliesEachItemIndependently() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion one = fixtures.draft(p, "One");
        QuestionVersion two = fixtures.draft(p, "Two");
        QuestionVersion done = fixtures.published(p, "Done");
        String json = send(post(DRAFTS + "/publish"), a, items(one, done, two)).andExpect(status().isOk())
                .andExpect(jsonPath("$.results.length()").value(3)).andExpect(jsonPath("$.results[0].ok").value(true))
                .andExpect(jsonPath("$.results[1].ok").value(false)).andExpect(jsonPath("$.results[1].problemStatus").value(409))
                .andExpect(jsonPath("$.results[1].detail").exists()).andExpect(jsonPath("$.results[2].ok").value(true))
                .andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(json, "$.results[0].questionId")).isEqualTo(one.questionId().toString());
        assertThat(statusOf(one.questionId(), 1)).isEqualTo("PUBLISHED");
        assertThat(statusOf(two.questionId(), 1)).isEqualTo("PUBLISHED");

        QuestionVersion three = fixtures.draft(p, "Three");
        send(post(DRAFTS + "/discard"), a, items(three, one)).andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].status").value("DISCARDED")).andExpect(jsonPath("$.results[1].problemStatus").value(409));
        assertThat(statusOf(three.questionId(), 1)).isEqualTo("DISCARDED");
    }

    @Test
    void bulkRejectsMoreThanAHundredItemsAndEmptyBodies() throws Exception {
        String a = admin();
        StringBuilder sb = new StringBuilder("{\"items\":[");
        for (int i = 0; i < 101; i++) {
            sb.append(i == 0 ? "" : ",").append("{\"questionId\":\"").append(UUID.randomUUID()).append("\",\"version\":1}");
        }
        send(post(DRAFTS + "/publish"), a, sb.append("]}").toString()).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='items')]").exists());
        send(post(DRAFTS + "/discard"), a, "{\"items\":[]}").andExpect(status().isBadRequest());
        send(post(DRAFTS + "/publish"), a, null).andExpect(status().isBadRequest());
        send(post(DRAFTS + "/publish"), a, "{\"items\":[{\"questionId\":\"nope\",\"version\":1}]}").andExpect(status().isOk())
                .andExpect(jsonPath("$.results[0].problemStatus").value(400));
    }

    @Test
    void draftListIsOldestFirstWithReplacesAndChangedFieldsAndSkipsDeleted() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion first = fixtures.draft(p, "Brand new");
        QuestionVersion v1 = fixtures.published(p, "Fixed");
        QuestionVersion v2 = v1.nextDraft(new in.minnal.core.question.domain.QuestionContent(ContentCategory.KERALA_PSC, p.subjectId(), p.topicId(),
                ExamLevel.TENTH, in.minnal.core.question.domain.Difficulty.EASY, null, "Fixed",
                List.of("A Fixed", "B Fixed", "C Fixed", "D Fixed"), 1, "A new explanation", "Kerala PSC test"), Instant.now().plusSeconds(5));
        fixtures.insertVersion(v2);
        QuestionVersion deleted = fixtures.draft(p, "Deleted");
        fixtures.softDelete(deleted.questionId());
        fixtures.published(p, "Published only");

        send(get(DRAFTS + "?page=0&size=500"), a, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(100)).andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.items[0].questionId").value(first.questionId().toString()))
                .andExpect(jsonPath("$.items[0].replacesVersion").doesNotExist())
                .andExpect(jsonPath("$.items[0].changedFields.length()").value(0))
                .andExpect(jsonPath("$.items[0].createdBy").value("seed"))
                .andExpect(jsonPath("$.items[0].content.textEn").value("Brand new"))
                .andExpect(jsonPath("$.items[1].questionId").value(v1.questionId().toString()))
                .andExpect(jsonPath("$.items[1].version").value(2)).andExpect(jsonPath("$.items[1].replacesVersion").value(1))
                .andExpect(jsonPath("$.items[1].changedFields[0]").value("answer"))
                .andExpect(jsonPath("$.items[1].changedFields[1]").value("explanation"))
                .andExpect(jsonPath("$.items[1].displayNo").isNumber());
        send(get(DRAFTS + "?subjectId=" + UUID.randomUUID()), a, null).andExpect(jsonPath("$.totalItems").value(0));
        send(get(DRAFTS + "?topicId=" + p.topicId() + "&category=KERALA_PSC"), a, null).andExpect(jsonPath("$.totalItems").value(2));
        send(get(DRAFTS + "?category=NOPE"), a, null).andExpect(status().isBadRequest());
        send(get(DRAFTS + "?size=0"), a, null).andExpect(status().isBadRequest());
    }

    @Test
    void editorSavedDraftCanBePublished() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        String body = """
                {"category":"KERALA_PSC","subjectId":"%s","topicId":"%s","examLevel":"TENTH","difficulty":"EASY",
                 "textMl":null,"textEn":"From editor","options":["Periyar","Pamba","Bharathapuzha","Chaliyar"],"answerIndex":0,
                 "explanation":"Because.","attribution":null}""".formatted(p.subjectId(), p.topicId());
        String created = send(post(QUESTIONS), a, body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.questionId");
        send(post(QUESTIONS + "/" + id + "/versions/1/publish"), a, null).andExpect(status().isOk());
        assertThat(served()).contains("From editor");
        // editing a published question makes version 2 a draft, which the queue then lists as a fix
        send(put(QUESTIONS + "/" + id + "/draft"), a, body.replace("From editor", "Edited").replace("}", ",\"rowVersion\":0}"))
                .andExpect(status().isOk());
        send(get(DRAFTS), a, null).andExpect(jsonPath("$.items[0].replacesVersion").value(1))
                .andExpect(jsonPath("$.items[0].changedFields[0]").value("textEn"));
    }

    @Autowired in.minnal.core.question.infrastructure.JdbcQuestionRepository questionRepository;

    @Test
    void aDraftEditedAfterItWasReadIsNotPublishedOrDiscarded() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        admin();
        QuestionVersion draft = fixtures.draft(p, "Racing");
        int read = questionRepository.rowVersion(draft.questionId(), 1).orElseThrow();
        // the editor saves the draft after the publish read it
        jdbc.sql("UPDATE question_version SET row_version = row_version + 1 WHERE id = :id").param("id", draft.id()).update();
        assertThat(questionRepository.publishDraft(draft.id(), read, "x", adminId, Instant.now())).isFalse();
        assertThat(questionRepository.discardDraft(draft.id(), read, adminId, Instant.now())).isFalse();
        assertThat(statusOf(draft.questionId(), 1)).isEqualTo("DRAFT");
        assertThat(questionRepository.publishDraft(draft.id(), read + 1, "x", adminId, Instant.now())).isTrue();
    }

    @Test
    void aFailingItemIsReportedAsA500AndTheOthersStillApply() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion ok1 = fixtures.draft(p, "Fine one");
        QuestionVersion bad = fixtures.draft(p, "boom");
        QuestionVersion ok2 = fixtures.draft(p, "Fine two");
        jdbc.sql("CREATE FUNCTION fail_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.text_en = 'boom' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$").update();
        jdbc.sql("CREATE TRIGGER fail_boom BEFORE UPDATE ON question_version FOR EACH ROW EXECUTE FUNCTION fail_boom()").update();
        try {
            send(post(DRAFTS + "/publish"), a, items(ok1, bad, ok2)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.results[0].ok").value(true)).andExpect(jsonPath("$.results[1].ok").value(false))
                    .andExpect(jsonPath("$.results[1].problemStatus").value(500)).andExpect(jsonPath("$.results[2].ok").value(true));
        } finally {
            jdbc.sql("DROP TRIGGER fail_boom ON question_version").update();
            jdbc.sql("DROP FUNCTION fail_boom()").update();
        }
        assertThat(statusOf(ok1.questionId(), 1)).isEqualTo("PUBLISHED");
        assertThat(statusOf(bad.questionId(), 1)).isEqualTo("DRAFT");
        assertThat(statusOf(ok2.questionId(), 1)).isEqualTo("PUBLISHED");
    }

    @Test
    void bulkItemsWithAMissingOrZeroVersionFailAloneWith400() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion draft = fixtures.draft(p, "Untouched");
        String body = "{\"items\":[{\"questionId\":\"" + draft.questionId() + "\"},{\"questionId\":\"" + draft.questionId() + "\",\"version\":0}]}";
        for (String action : List.of("publish", "discard")) {
            send(post(DRAFTS + "/" + action), a, body).andExpect(status().isOk())
                    .andExpect(jsonPath("$.results[0].ok").value(false)).andExpect(jsonPath("$.results[0].problemStatus").value(400))
                    .andExpect(jsonPath("$.results[1].ok").value(false)).andExpect(jsonPath("$.results[1].problemStatus").value(400));
        }
        assertThat(statusOf(draft.questionId(), 1)).isEqualTo("DRAFT");
    }

    @Test
    void draftFiltersByCategoryAndTopic() throws Exception {
        var history = fixtures.placement("History", "Kerala");
        var science = fixtures.placement("Science", "Physics");
        String a = admin();
        fixtures.draft(history, "In history");
        fixtures.draft(science, ContentCategory.SCHOOL_QUIZ, "In science");
        send(get(DRAFTS + "?category=KERALA_PSC"), a, null).andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].content.textEn").value("In history"));
        send(get(DRAFTS + "?category=SCHOOL_QUIZ"), a, null).andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].content.textEn").value("In science"));
        send(get(DRAFTS + "?category=GENERAL_KERALA"), a, null).andExpect(jsonPath("$.totalItems").value(0));
        send(get(DRAFTS + "?topicId=" + science.topicId()), a, null).andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].content.textEn").value("In science"));
        send(get(DRAFTS + "?topicId=" + history.topicId() + "&category=SCHOOL_QUIZ"), a, null).andExpect(jsonPath("$.totalItems").value(0));
        send(get(DRAFTS + "?subjectId=" + history.subjectId()), a, null).andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].content.textEn").value("In history"));
        send(get(DRAFTS + "?topicId=" + UUID.randomUUID()), a, null).andExpect(jsonPath("$.totalItems").value(0));
    }

    @Test
    void theQuestionsListShowsWhoPublishedAndDiscarded() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        QuestionVersion seeded = fixtures.published(p, "Seeded one");
        QuestionVersion toPublish = fixtures.draft(p, "Gets published");
        QuestionVersion toDiscard = fixtures.draft(p, "Gets discarded");
        send(post(url(toPublish, "publish")), a, null).andExpect(status().isOk());
        send(post(url(toDiscard, "discard")), a, null).andExpect(status().isOk());
        send(get(QUESTIONS + "?size=10"), a, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.questionId=='" + seeded.questionId() + "')].publishedBy").value("seed"))
                .andExpect(jsonPath("$.items[?(@.questionId=='" + toPublish.questionId() + "')].publishedBy").value("Boss"))
                .andExpect(jsonPath("$.items[?(@.questionId=='" + toPublish.questionId() + "')].publishedAt").isNotEmpty())
                .andExpect(jsonPath("$.items[?(@.questionId=='" + toDiscard.questionId() + "')].discardedBy").value("Boss"))
                .andExpect(jsonPath("$.items[?(@.questionId=='" + toDiscard.questionId() + "')].discardedAt").isNotEmpty());
    }
}
