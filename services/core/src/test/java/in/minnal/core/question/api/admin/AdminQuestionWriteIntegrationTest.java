package in.minnal.core.question.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.support.PostgresIntegrationTest;
import in.minnal.core.support.QuestionFixtures;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@TestPropertySource(properties = {"minnal.auth.admin-emails=boss@example.com", "minnal.auth.web-url=http://localhost:5173"})
class AdminQuestionWriteIntegrationTest extends PostgresIntegrationTest {

    static final String QUESTIONS = "/api/core/v1/admin/questions";
    static final String SUBJECTS = "/api/core/v1/admin/subjects";

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

    static String body(QuestionFixtures.Placement p, String textEn, String extra) {
        return """
                {"category":"KERALA_PSC","subjectId":"%s","topicId":"%s","examLevel":"TENTH","difficulty":"EASY",
                 "textMl":null,"textEn":"%s","options":["Periyar","Pamba","Bharathapuzha","Chaliyar"],"answerIndex":0,
                 "explanation":"Because.","attribution":"Kerala PSC LDC 2019"%s}""".formatted(p.subjectId(), p.topicId(), textEn, extra);
    }

    String servedIds() throws Exception {
        return mvc.perform(post("/internal/question-sets").header("X-Internal-Token", "it-internal-token").contentType(MediaType.APPLICATION_JSON)
                .content("{\"source\":\"BANK\",\"filters\":{\"category\":\"KERALA_PSC\"},\"count\":1,\"requesterId\":\"p\"}"))
                .andReturn().getResponse().getContentAsString();
    }

    String create(String a, QuestionFixtures.Placement p, String text) throws Exception {
        String json = send(post(QUESTIONS), a, body(p, text, "")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.questionId");
    }

    @Test
    void authMatrixOnEveryWriteEndpoint() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String id = UUID.randomUUID().toString();
        String guest = "Bearer " + guestTokens.issue("en").accessToken();
        String user = player();
        for (var request : java.util.List.<java.util.function.Supplier<MockHttpServletRequestBuilder>>of(
                () -> post(QUESTIONS), () -> put(QUESTIONS + "/" + id + "/draft"), () -> delete(QUESTIONS + "/" + id),
                () -> post(QUESTIONS + "/" + id + "/restore"), () -> post(SUBJECTS), () -> post(SUBJECTS + "/" + id + "/topics"),
                () -> get(QUESTIONS + "/" + id))) {
            send(request.get(), null, body(p, "x", "")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401));
            send(request.get(), user, body(p, "x", "")).andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
            send(request.get(), guest, body(p, "x", "")).andExpect(status().isForbidden());
        }
    }

    @Test
    void createMakesADraftThatIsNotServed() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        send(post(QUESTIONS), a, body(p, "Longest river?", ",\"sourceRef\":\"LDC-2019-1\""))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.displayNo").isNumber()).andExpect(jsonPath("$.questionId").exists());
        assertThat(jdbc.sql("SELECT created_by FROM question").query(UUID.class).single()).isEqualTo(adminId);
        assertThat(jdbc.sql("SELECT created_by FROM question_version").query(UUID.class).single()).isEqualTo(adminId);
        assertThat(servedIds()).doesNotContain("Longest river?");
    }

    @Test
    void invalidCreateListsEveryProblemAndStoresNothing() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        String bad = """
                {"category":"NOPE","subjectId":"%s","topicId":"%s","examLevel":"TENTH","difficulty":"EASY",
                 "textEn":"%s","options":["A","a","C","D"],"answerIndex":9,"explanation":""}""".formatted(p.subjectId(), p.topicId(), "x".repeat(1001));
        send(post(QUESTIONS), a, bad).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='category')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='textEn')].fix").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='options')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='answerIndex')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='explanation')]").exists());
        send(post(QUESTIONS), a, "{\"subjectId\":\"nope\",\"topicId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='subjectId')]").exists());
        send(post(QUESTIONS), a, "not json").andExpect(status().isBadRequest());
        // topic from another subject
        var other = fixtures.placement("Science", "Physics");
        send(post(QUESTIONS), a, body(new QuestionFixtures.Placement(p.subjectId(), other.topicId()), "q", "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='topicId')]").exists());
        assertThat(jdbc.sql("SELECT count(*) FROM question").query(Long.class).single()).isZero();
    }

    @Test
    void reusedSourceRefIsAFieldErrorEvenWhenDeleted() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        String id = JsonPath.read(send(post(QUESTIONS), a, body(p, "one", ",\"sourceRef\":\"REF-1\"")).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.questionId");
        send(post(QUESTIONS), a, body(p, "two", ",\"sourceRef\":\" REF-1 \"")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("sourceRef"));
        send(delete(QUESTIONS + "/" + id), a, null).andExpect(status().isNoContent());
        send(post(QUESTIONS), a, body(p, "two", ",\"sourceRef\":\"REF-1\"")).andExpect(status().isBadRequest());
    }

    @Test
    void editingAPublishedQuestionCreatesNextDraftAndKeepsServingTheOld() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        QuestionVersion v1 = fixtures.published(p, "Old text");
        String a = admin();
        send(put(QUESTIONS + "/" + v1.questionId() + "/draft"), a, body(p, "New text", ""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.status").value("DRAFT"));
        String served = servedIds();
        assertThat(served).contains("Old text").doesNotContain("New text");
        assertThat(JsonPath.<Integer>read(served, "$.questions[0].version")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT status || ':' || version FROM question_version WHERE question_id = :id ORDER BY version")
                .param("id", v1.questionId()).query(String.class).list()).containsExactly("PUBLISHED:1", "DRAFT:2");
        assertThat(jdbc.sql("SELECT text_en FROM question_version WHERE question_id = :id AND version = 1").param("id", v1.questionId()).query(String.class).single())
                .isEqualTo("Old text");
    }

    @Test
    void nextVersionCountsDiscardedOnes() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        QuestionVersion v1 = fixtures.published(p, "Old text");
        fixtures.insertVersion(new QuestionVersion(UUID.randomUUID(), v1.questionId(), 2, in.minnal.core.question.domain.VersionStatus.DRAFT,
                v1.content(), null, null, Instant.now()).discard());
        send(put(QUESTIONS + "/" + v1.questionId() + "/draft"), admin(), body(p, "again", "")).andExpect(jsonPath("$.version").value(3));
    }

    @Test
    void openDraftIsUpdatedInPlaceAndAStaleRowVersionIs409() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        String id = create(a, p, "first");
        String url = QUESTIONS + "/" + id + "/draft";
        send(put(url), a, body(p, "second", ",\"rowVersion\":0")).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.rowVersion").value(1));
        assertThat(jdbc.sql("SELECT count(*) FROM question_version").query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT updated_by FROM question_version").query(UUID.class).single()).isEqualTo(adminId);
        assertThat(jdbc.sql("SELECT updated_at IS NOT NULL FROM question_version").query(Boolean.class).single()).isTrue();
        send(put(url), a, body(p, "third", ",\"rowVersion\":0")).andExpect(status().isConflict()).andExpect(jsonPath("$.status").value(409));
        send(put(url), a, body(p, "third", "")).andExpect(status().isConflict());
        send(put(url), a, body(p, "third", ",\"rowVersion\":1")).andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT text_en FROM question_version").query(String.class).single()).isEqualTo("third");
        send(put(QUESTIONS + "/" + UUID.randomUUID() + "/draft"), a, body(p, "x", "")).andExpect(status().isNotFound());
    }

    @Test
    void onlyOneOpenDraftPerQuestionIsAllowed() {
        var p = fixtures.placement("History", "Kerala");
        QuestionVersion draft = fixtures.draft(p, "a");
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DuplicateKeyException.class, () ->
                fixtures.insertVersion(new QuestionVersion(UUID.randomUUID(), draft.questionId(), 2, in.minnal.core.question.domain.VersionStatus.DRAFT,
                        draft.content(), null, null, Instant.now())));
    }

    @Test
    void deleteDiscardsDraftStopsServingAndRestoreBringsTheLatestPublishedBack() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        QuestionVersion v1 = fixtures.published(p, "Live text");
        String a = admin();
        String url = QUESTIONS + "/" + v1.questionId();
        send(put(url + "/draft"), a, body(p, "Fix", "")).andExpect(status().isOk());
        assertThat(servedIds()).contains("Live text");

        send(delete(url), a, null).andExpect(status().isNoContent());
        assertThat(jdbc.sql("SELECT deleted_by FROM question").query(UUID.class).single()).isEqualTo(adminId);
        assertThat(jdbc.sql("SELECT status FROM question_version WHERE version = 2").query(String.class).single()).isEqualTo("DISCARDED");
        assertThat(jdbc.sql("SELECT count(*) FROM question_version").query(Long.class).single()).isEqualTo(2);
        assertThat(servedIds()).doesNotContain("Live text");
        send(delete(url), a, null).andExpect(status().isConflict());
        send(put(url + "/draft"), a, body(p, "Fix2", "")).andExpect(status().isConflict());

        send(post(url + "/restore"), a, null).andExpect(status().isNoContent());
        String served = servedIds();
        assertThat(served).contains("Live text");
        assertThat(JsonPath.<Integer>read(served, "$.questions[0].version")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT status FROM question_version WHERE version = 2").query(String.class).single()).isEqualTo("DISCARDED");
        send(post(url + "/restore"), a, null).andExpect(status().isConflict());
        send(delete(QUESTIONS + "/" + UUID.randomUUID()), a, null).andExpect(status().isNotFound());
        send(post(QUESTIONS + "/" + UUID.randomUUID() + "/restore"), a, null).andExpect(status().isNotFound());
    }

    @Test
    void subjectAndTopicCreationReportsExistingIdOnDuplicate() throws Exception {
        String a = admin();
        String created = send(post(SUBJECTS), a, "{\"name\":\" Geography \"}").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String subjectId = JsonPath.read(created, "$.id");
        send(post(SUBJECTS), a, "{\"name\":\"GEOGRAPHY\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.id").value(subjectId));
        send(post(SUBJECTS), a, "{\"name\":\"  \"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("name"));
        String topic = JsonPath.read(send(post(SUBJECTS + "/" + subjectId + "/topics"), a, "{\"name\":\"Rivers\"}").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
        send(post(SUBJECTS + "/" + subjectId + "/topics"), a, "{\"name\":\"rivers\"}").andExpect(status().isConflict()).andExpect(jsonPath("$.id").value(topic));
        send(post(SUBJECTS + "/" + UUID.randomUUID() + "/topics"), a, "{\"name\":\"Rivers\"}").andExpect(status().isNotFound());
        send(get(SUBJECTS), a, null).andExpect(jsonPath("$[0].topics[0].name").value("Rivers"));
    }

    @Test
    void detailShowsTheEditedVersionAndHistoryWithSeedAndAdminAuthors() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        QuestionVersion v1 = fixtures.published(p, "Seeded");
        String a = admin();
        send(put(QUESTIONS + "/" + v1.questionId() + "/draft"), a, body(p, "Fix", "")).andExpect(status().isOk());
        send(get(QUESTIONS + "/" + v1.questionId()), a, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.editing.version").value(2)).andExpect(jsonPath("$.editing.status").value("DRAFT"))
                .andExpect(jsonPath("$.editing.rowVersion").value(0)).andExpect(jsonPath("$.editing.content.textEn").value("Fix"))
                .andExpect(jsonPath("$.versions[0].createdBy").value("Boss")).andExpect(jsonPath("$.versions[1].createdBy").value("seed"))
                .andExpect(jsonPath("$.deleted").value(false));
        send(get(QUESTIONS + "/" + UUID.randomUUID()), a, null).andExpect(status().isNotFound());
    }

    @Test
    void listUpdatedAtFollowsAnInPlaceDraftEdit() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        String a = admin();
        String id = create(a, p, "first");
        send(put(QUESTIONS + "/" + id + "/draft"), a, body(p, "second", ",\"rowVersion\":0")).andExpect(status().isOk());
        Instant updatedAt = jdbc.sql("SELECT updated_at FROM question_version").query(java.time.OffsetDateTime.class).single().toInstant();
        Instant createdAt = jdbc.sql("SELECT created_at FROM question_version").query(java.time.OffsetDateTime.class).single().toInstant();
        assertThat(updatedAt).isAfter(createdAt);
        String json = send(get(QUESTIONS), a, null).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(Instant.parse(JsonPath.<String>read(json, "$.items[0].updatedAt"))).isEqualTo(updatedAt);
    }
}
