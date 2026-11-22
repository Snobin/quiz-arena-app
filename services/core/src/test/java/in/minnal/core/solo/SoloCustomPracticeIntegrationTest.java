package in.minnal.core.solo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.support.PostgresIntegrationTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Story 6.4: Solo Practice on a custom topic (ownership, revision, secrecy, no side effects). */
class SoloCustomPracticeIntegrationTest extends PostgresIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired JsonMapper json;

    record Player(UUID id, String auth) {
    }

    Player player() {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', null, 'X', :t, :t)")
                .param("id", id).param("t", Timestamp.from(Instant.now())).update();
        return new Player(id, "Bearer " + userTokens.issue(new Account(id, null, "P"), "en").accessToken());
    }

    /** A topic of {@code n} questions; question i has options "i-A".."i-D", the answer is stored option 2 ("C"). */
    UUID topic(Player owner, String name, int n, String lang) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO custom_topic (id, owner_user_id, name, name_key, question_count, revision, created_at, updated_at) VALUES (:id, :o, :n, :k, :c, 1, :t, :t)")
                .param("id", id).param("o", owner.id()).param("n", name).param("k", name.toLowerCase()).param("c", n)
                .param("t", Timestamp.from(Instant.now())).update();
        fill(id, n, lang, "Q");
        return id;
    }

    void fill(UUID topicId, int n, String lang, String prefix) {
        for (int i = 0; i < n; i++) {
            jdbc.sql("INSERT INTO custom_question (id, custom_topic_id, position, text, lang, option_a, option_b, option_c, option_d, answer_index, explanation) VALUES (:id, :t, :p, :text, :lang, 'A', 'B', 'C', 'D', 2, :ex)")
                    .param("id", UUID.randomUUID()).param("t", topicId).param("p", i + 1).param("text", prefix + i).param("lang", lang)
                    .param("ex", "Because " + prefix + i).update();
        }
    }

    /** What a re-import does: new rows (new ids), revision + 1. */
    void reimport(UUID topicId, int n) {
        jdbc.sql("DELETE FROM custom_question WHERE custom_topic_id = :t").param("t", topicId).update();
        fill(topicId, n, "en", "New");
        jdbc.sql("UPDATE custom_topic SET revision = revision + 1, question_count = :n WHERE id = :t").param("t", topicId).param("n", n).update();
    }

    ResultActions start(String auth, UUID topicId) throws Exception {
        return mvc.perform(post("/api/core/v1/solo/sessions").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"source\":{\"type\":\"CUSTOM\",\"customTopicId\":\"" + topicId + "\"}}"));
    }

    UUID startOk(Player p, UUID topicId) throws Exception {
        String body = start(p.auth(), topicId).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(body).get("sessionId").asString());
    }

    ResultActions nextRaw(Player p, UUID session) throws Exception {
        return mvc.perform(get("/api/core/v1/solo/sessions/" + session + "/next").header("Authorization", p.auth()));
    }

    JsonNode next(Player p, UUID session) throws Exception {
        return json.readTree(nextRaw(p, session).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    ResultActions answer(Player p, UUID session, JsonNode n, int option) throws Exception {
        return mvc.perform(post("/api/core/v1/solo/sessions/" + session + "/answers").header("Authorization", p.auth())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionId\":\"" + n.get("question").get("questionId").asString() + "\",\"version\":"
                        + n.get("question").get("version").asInt() + ",\"optionIndex\":" + option + "}"));
    }

    static int shownC(JsonNode n) {
        for (int i = 0; i < 4; i++) {
            if (n.get("question").get("options").get(i).asString().equals("C")) {
                return i;
            }
        }
        throw new AssertionError("no C option");
    }

    @Test
    void startReturnsTheCustomSourceAndPoolSize() throws Exception {
        Player p = player();
        UUID t = topic(p, "My batch", 3, "en");
        start(p.auth(), t).andExpect(status().isCreated()).andExpect(jsonPath("$.source.type").value("CUSTOM"))
                .andExpect(jsonPath("$.source.customTopicId").value(t.toString())).andExpect(jsonPath("$.source.topicName").value("My batch"))
                .andExpect(jsonPath("$.poolSize").value(3));
    }

    @Test
    void someoneElsesAndUnknownTopicsAreTheSame404AndGuestIs403() throws Exception {
        Player owner = player();
        Player other = player();
        UUID t = topic(owner, "Mine", 2, "en");
        String foreign = start(other.auth(), t).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String unknown = start(other.auth(), UUID.randomUUID()).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        assertThat(foreign).isEqualTo(unknown);
        start("Bearer " + guestTokens.issue("en").accessToken(), t).andExpect(status().isForbidden());
        mvc.perform(post("/api/core/v1/solo/sessions").header("Authorization", owner.auth()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"source\":{\"type\":\"CUSTOM\"}}")).andExpect(status().isBadRequest());
    }

    @Test
    void nextCarriesNoAnswerFieldsAndPutsTheTextInTheWrittenLanguage() throws Exception {
        Player p = player();
        UUID ml = topic(p, "Malayalam", 2, "ml");
        UUID en = topic(p, "English", 2, "en");
        String raw = nextRaw(p, startOk(p, ml)).andExpect(status().isOk()).andExpect(jsonPath("$.question.textMl").exists())
                .andExpect(jsonPath("$.question.textEn").doesNotExist()).andExpect(jsonPath("$.question.version").value(1))
                .andReturn().getResponse().getContentAsString();
        assertThat(raw).doesNotContainIgnoringCase("answer").doesNotContainIgnoringCase("explanation")
                .doesNotContainIgnoringCase("attribution").doesNotContainIgnoringCase("correct").doesNotContain("Because");
        nextRaw(p, startOk(p, en)).andExpect(jsonPath("$.question.textEn").exists()).andExpect(jsonPath("$.question.textMl").doesNotExist());
    }

    @Test
    void noRepeatWithinACycleThenReshuffleAndAOneQuestionTopicRepeats() throws Exception {
        Player p = player();
        UUID t = topic(p, "Five", 5, "en");
        UUID session = startOk(p, t);
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 5; i++) {
            JsonNode n = next(p, session);
            assertThat(n.get("reshuffled").asBoolean()).isFalse();
            assertThat(seen.add(n.get("question").get("questionId").asString())).isTrue();
            answer(p, session, n, 0).andExpect(status().isOk());
        }
        JsonNode again = next(p, session);
        assertThat(again.get("reshuffled").asBoolean()).isTrue();
        assertThat(seen).contains(again.get("question").get("questionId").asString());

        UUID one = startOk(p, topic(p, "One", 1, "en"));
        String first = null;
        for (int i = 0; i < 3; i++) {
            JsonNode n = next(p, one);
            if (first == null) {
                first = n.get("question").get("questionId").asString();
            }
            assertThat(n.get("question").get("questionId").asString()).isEqualTo(first);
            assertThat(n.get("reshuffled").asBoolean()).isEqualTo(i > 0);
            answer(p, one, n, 0).andExpect(status().isOk());
        }
    }

    @Test
    void theAnswerResponseRevealsTheAnswerWithNoAttributionAndNothingIsPublished() throws Exception {
        Player p = player();
        UUID t = topic(p, "Mine", 4, "en");
        long before = jdbc.sql("SELECT (SELECT count(*) FROM event_outbox) + (SELECT count(*) FROM recent_topic)").query(Long.class).single();
        UUID session = startOk(p, t);
        JsonNode n = next(p, session);
        int c = shownC(n);
        answer(p, session, n, c).andExpect(status().isOk()).andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.answerIndex").value(c)).andExpect(jsonPath("$.explanation").exists())
                .andExpect(jsonPath("$.attribution").doesNotExist()).andExpect(jsonPath("$.answeredCount").value(1));
        answer(p, session, n, c).andExpect(status().isConflict());
        mvc.perform(post("/api/core/v1/solo/sessions/" + session + "/end").header("Authorization", p.auth()))
                .andExpect(jsonPath("$.answeredCount").value(1));
        long after = jdbc.sql("SELECT (SELECT count(*) FROM event_outbox) + (SELECT count(*) FROM recent_topic)").query(Long.class).single();
        assertThat(after).isEqualTo(before);
    }

    @Test
    void aReimportMakesTheOldAnswerA409AndNextRebuildsKeepingTheTally() throws Exception {
        Player p = player();
        UUID t = topic(p, "Mine", 3, "en");
        UUID session = startOk(p, t);
        JsonNode first = next(p, session);
        answer(p, session, first, shownC(first)).andExpect(status().isOk());
        JsonNode second = next(p, session);
        reimport(t, 2);
        answer(p, session, second, 0).andExpect(status().isConflict()).andExpect(jsonPath("$.type").value("urn:minnal:problem:topic-changed"));
        JsonNode rebuilt = next(p, session);
        assertThat(rebuilt.get("reshuffled").asBoolean()).isTrue();
        assertThat(rebuilt.get("question").get("version").asInt()).isEqualTo(2);
        assertThat(rebuilt.get("question").get("textEn").asString()).startsWith("New");
        assertThat(rebuilt.get("position").asInt()).isEqualTo(2);
        answer(p, session, rebuilt, shownC(rebuilt)).andExpect(status().isOk()).andExpect(jsonPath("$.answeredCount").value(2))
                .andExpect(jsonPath("$.correctCount").value(2));
    }

    @Test
    void aDeletedTopicIs404TopicDeletedOnEverySessionCall() throws Exception {
        Player p = player();
        UUID t = topic(p, "Mine", 3, "en");
        UUID session = startOk(p, t);
        JsonNode n = next(p, session);
        jdbc.sql("DELETE FROM custom_topic WHERE id = :t").param("t", t).update();
        nextRaw(p, session).andExpect(status().isNotFound()).andExpect(jsonPath("$.type").value("urn:minnal:problem:topic-deleted"));
        answer(p, session, n, 0).andExpect(status().isNotFound()).andExpect(jsonPath("$.type").value("urn:minnal:problem:topic-deleted"));
    }

    @Test
    void aSessionStoredBeforeTheRevisionFieldStillLoads() {
        String old = "{\"sessionId\":\"" + UUID.randomUUID() + "\",\"userId\":\"" + UUID.randomUUID()
                + "\",\"source\":{\"type\":\"BANK\",\"topicId\":\"" + UUID.randomUUID() + "\"},\"cycle\":1,\"order\":[],\"cursor\":0,"
                + "\"current\":null,\"answeredCount\":0,\"correctCount\":0}";
        in.minnal.core.solo.application.SoloSession loaded = json.readValue(old, in.minnal.core.solo.application.SoloSession.class);
        assertThat(loaded.source().revision()).isNull();
        assertThat(loaded.source().isCustom()).isFalse();
    }
}
