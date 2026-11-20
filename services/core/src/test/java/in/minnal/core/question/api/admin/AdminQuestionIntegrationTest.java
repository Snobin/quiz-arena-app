package in.minnal.core.question.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(properties = {"minnal.auth.admin-emails=boss@example.com", "minnal.auth.web-url=http://localhost:5173"})
class AdminQuestionIntegrationTest extends PostgresIntegrationTest {

    static final String QUESTIONS = "/api/core/v1/admin/questions";
    static final String SUBJECTS = "/api/core/v1/admin/subjects";

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired QuestionFixtures fixtures;

    UUID user(String email) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', :email, 'X', :t, :t)")
                .param("id", id).param("email", email).param("t", Timestamp.from(Instant.now())).update();
        return id;
    }

    String admin() {
        UUID id = user("boss@example.com");
        return "Bearer " + userTokens.issue(new Account(id, "boss@example.com", "Boss"), "en").accessToken();
    }

    String player() {
        UUID id = user(null);
        return "Bearer " + userTokens.issue(new Account(id, null, "P"), "en").accessToken();
    }

    ResultActions getAs(String auth, String url) throws Exception {
        return mvc.perform(auth == null ? get(url) : get(url).header("Authorization", auth));
    }

    @Test
    void authMatrixOnBothEndpoints() throws Exception {
        for (String url : new String[] {QUESTIONS, SUBJECTS}) {
            getAs(null, url).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401)).andExpect(jsonPath("$.title").exists())
                    .andExpect(jsonPath("$.detail").exists()).andExpect(jsonPath("$.type").exists());
            getAs("Bearer garbage", url).andExpect(status().isUnauthorized());
            getAs(player(), url).andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
            getAs("Bearer " + guestTokens.issue("en").accessToken(), url).andExpect(status().isForbidden());
            getAs(admin(), url).andExpect(status().isOk());
        }
    }

    @Test
    void stateIsDerivedAndRowShowsLatestPublishedElseLatest() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        QuestionVersion published = fixtures.published(p, "published one");
        QuestionVersion draftOnly = fixtures.draft(p, "draft one");
        QuestionVersion discarded = fixtures.discarded(p, "discarded one");
        QuestionVersion deleted = fixtures.published(p, "deleted one");
        fixtures.softDelete(deleted.questionId());
        QuestionVersion pending = fixtures.published(p, "has pending");
        fixtures.insertVersion(pending.nextDraft(fixtures.content(p, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "pending text"), Instant.now()));
        String a = admin();

        getAs(a, QUESTIONS).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(5)).andExpect(jsonPath("$.size").value(50));
        assertState(a, "PUBLISHED", 2);
        assertState(a, "DRAFT", 1);
        assertState(a, "DISCARDED", 1);
        assertState(a, "DELETED", 1);
        getAs(a, QUESTIONS + "?status=PUBLISHED&q=has pending").andExpect(jsonPath("$.items[0].hasPendingDraft").value(true))
                .andExpect(jsonPath("$.items[0].pendingDraftVersion").value(2)).andExpect(jsonPath("$.items[0].textEn").value("has pending")).andExpect(jsonPath("$.items[0].currentVersion").value(1));
        getAs(a, QUESTIONS + "?status=DRAFT").andExpect(jsonPath("$.items[0].questionId").value(draftOnly.questionId().toString()));
        assertThat(published.questionId()).isNotEqualTo(discarded.questionId());
    }

    void assertState(String a, String state, int expected) throws Exception {
        getAs(a, QUESTIONS + "?status=" + state).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(expected));
    }

    @Test
    void filtersCombineWithAnd() throws Exception {
        var history = fixtures.placement("History", "Kerala");
        var science = fixtures.placement("Science", "Physics");
        fixtures.published(history, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "alpha");
        fixtures.published(science, ContentCategory.SCHOOL_QUIZ, ExamLevel.DEGREE, "beta");
        String a = admin();
        getAs(a, QUESTIONS + "?subjectId=" + history.subjectId()).andExpect(jsonPath("$.totalItems").value(1)).andExpect(jsonPath("$.items[0].subject").value("History"));
        getAs(a, QUESTIONS + "?topicId=" + science.topicId() + "&examLevel=DEGREE&category=SCHOOL_QUIZ&difficulty=EASY").andExpect(jsonPath("$.totalItems").value(1));
        getAs(a, QUESTIONS + "?topicId=" + science.topicId() + "&examLevel=TENTH").andExpect(jsonPath("$.totalItems").value(0));
    }

    ResultActions search(String auth, String q) throws Exception {
        return mvc.perform(get(QUESTIONS).header("Authorization", auth).param("q", q));
    }

    @Test
    void searchIsCaseInsensitiveNfcAndIgnoresOneCharacter() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        fixtures.published(p, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "കേരളത്തിന്റെ തലസ്ഥാനം?", "Capital of Kerala");
        fixtures.published(p, "Something else 100%");
        fixtures.published(p, "Caf\u00e9 au lait");
        String a = admin();
        search(a, "capital OF").andExpect(jsonPath("$.totalItems").value(1));
        search(a, "x").andExpect(jsonPath("$.totalItems").value(3));
        search(a, "തലസ്ഥാനം").andExpect(jsonPath("$.totalItems").value(1));
        // decomposed input (NFD) matches the NFC stored text
        search(a, "Caf" + java.text.Normalizer.normalize("\u00e9", java.text.Normalizer.Form.NFD)).andExpect(jsonPath("$.totalItems").value(1));
        // LIKE wildcards are literal
        search(a, "100%").andExpect(jsonPath("$.totalItems").value(1));
        search(a, "__").andExpect(jsonPath("$.totalItems").value(0));
    }

    @Test
    void badQueriesAre400AndSizeIsClamped() throws Exception {
        String a = admin();
        for (String bad : new String[] {"status=NOPE", "category=NOPE", "examLevel=nope", "difficulty=X", "page=-1", "page=abc", "subjectId=zzz", "size=0"}) {
            getAs(a, QUESTIONS + "?" + bad).andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400)).andExpect(jsonPath("$.detail").exists());
        }
        getAs(a, QUESTIONS + "?size=500").andExpect(status().isOk()).andExpect(jsonPath("$.size").value(100));
    }

    @Test
    void paginatesNewestFirst() throws Exception {
        var p = fixtures.placement("History", "Kerala");
        fixtures.published(p, "first");
        fixtures.published(p, "second");
        fixtures.published(p, "third");
        String a = admin();
        getAs(a, QUESTIONS + "?size=2").andExpect(jsonPath("$.items.length()").value(2)).andExpect(jsonPath("$.totalItems").value(3))
                .andExpect(jsonPath("$.items[0].textEn").value("third")).andExpect(jsonPath("$.items[1].textEn").value("second"));
        getAs(a, QUESTIONS + "?size=2&page=1").andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].textEn").value("first"));
        getAs(a, QUESTIONS + "?size=2&page=9").andExpect(jsonPath("$.items.length()").value(0)).andExpect(jsonPath("$.totalItems").value(3));
    }

    @Test
    void subjectsListTopics() throws Exception {
        fixtures.placement("History", "Kerala");
        fixtures.placement("Science", "Physics");
        getAs(admin(), SUBJECTS).andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].name").value("History"))
                .andExpect(jsonPath("$[0].topics[0].name").value("Kerala"));
    }

    @Test
    void displayNoIsUniqueAndNeverReused() {
        var p = fixtures.placement("History", "Kerala");
        QuestionVersion a = fixtures.published(p, "a");
        QuestionVersion b = fixtures.published(p, "b");
        long first = displayNo(a.questionId());
        long second = displayNo(b.questionId());
        assertThat(second).isGreaterThan(first);
        jdbc.sql("DELETE FROM question_version WHERE question_id = :id").param("id", b.questionId()).update();
        jdbc.sql("DELETE FROM question WHERE id = :id").param("id", b.questionId()).update();
        assertThat(displayNo(fixtures.published(p, "c").questionId())).isGreaterThan(second);
    }

    long displayNo(UUID id) {
        return jdbc.sql("SELECT display_no FROM question WHERE id = :id").param("id", id).query(Long.class).single();
    }
}
