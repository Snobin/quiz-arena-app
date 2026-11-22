package in.minnal.core.solo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.solo.infrastructure.InMemorySoloSessionStore;
import in.minnal.core.support.PostgresIntegrationTest;
import in.minnal.core.support.QuestionFixtures;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Story 4.3: Solo Practice API (answer secrecy, no repeats per cycle, ownership, errors, no side effects). */
class SoloPracticeIntegrationTest extends PostgresIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired QuestionFixtures fixtures;
    @Autowired InMemorySoloSessionStore store;
    @Autowired JsonMapper json;

    String player() {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', null, 'X', :t, :t)")
                .param("id", id).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(id, null, "P"), "en").accessToken();
    }

    List<QuestionVersion> publish(QuestionFixtures.Placement placement, int n) {
        return java.util.stream.IntStream.range(0, n).mapToObj(i -> fixtures.published(placement, "Q" + i + "-" + UUID.randomUUID())).toList();
    }

    ResultActions start(String auth, UUID topicId) throws Exception {
        return mvc.perform(post("/api/core/v1/solo/sessions").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"source\":{\"type\":\"BANK\",\"topicId\":\"" + topicId + "\"}}"));
    }

    UUID startOk(String auth, UUID topicId) throws Exception {
        String body = start(auth, topicId).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(body).get("sessionId").asString());
    }

    JsonNode next(String auth, UUID session) throws Exception {
        return json.readTree(mvc.perform(get("/api/core/v1/solo/sessions/" + session + "/next").header("Authorization", auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    ResultActions answer(String auth, UUID session, String questionId, int version, int option) throws Exception {
        return mvc.perform(post("/api/core/v1/solo/sessions/" + session + "/answers").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionId\":\"" + questionId + "\",\"version\":" + version + ",\"optionIndex\":" + option + "}"));
    }

    /** Serves and answers one question; returns its id. */
    /** Options are shuffled per session; the fixtures store the answer as the option starting with "C ". */
    static int shownCorrect(JsonNode next) {
        for (int i = 0; i < 4; i++) {
            if (next.get("question").get("options").get(i).asString().startsWith("C ")) {
                return i;
            }
        }
        throw new AssertionError("no option starting with \"C \"");
    }

    String serveAndAnswer(String auth, UUID session, int option) throws Exception {
        JsonNode n = next(auth, session);
        String id = n.get("question").get("questionId").asString();
        answer(auth, session, id, n.get("question").get("version").asInt(), option).andExpect(status().isOk());
        return id;
    }

    @Test
    void startReturnsSessionAndTopicNames() throws Exception {
        var placement = fixtures.placement("History", "Kerala History");
        publish(placement, 10);
        start(player(), placement.topicId()).andExpect(status().isCreated())
                .andExpect(jsonPath("$.source.type").value("BANK"))
                .andExpect(jsonPath("$.source.topicName").value("Kerala History"))
                .andExpect(jsonPath("$.source.subjectName").value("History"))
                .andExpect(jsonPath("$.poolSize").value(10));
    }

    @Test
    void shortAndUnknownSourcesAreRefused() throws Exception {
        String p = player();
        var placement = fixtures.placement("History", "Short");
        publish(placement, 9);
        start(p, placement.topicId()).andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.type").value("urn:minnal:problem:topic-unavailable"));
        start(p, UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test
    void nextHasNoAnswerFieldsAndIsIdempotentUntilAnswered() throws Exception {
        String p = player();
        var placement = fixtures.placement("History", "Kerala History");
        publish(placement, 10);
        UUID session = startOk(p, placement.topicId());
        String raw = mvc.perform(get("/api/core/v1/solo/sessions/" + session + "/next").header("Authorization", p))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(raw).doesNotContainIgnoringCase("answer").doesNotContainIgnoringCase("explanation")
                .doesNotContainIgnoringCase("attribution").doesNotContainIgnoringCase("correct").doesNotContain("Explanation of");
        JsonNode first = json.readTree(raw);
        assertThat(first.get("position").asInt()).isEqualTo(1);
        assertThat(first.get("reshuffled").asBoolean()).isFalse();
        assertThat(first.get("question").get("options").size()).isEqualTo(4);
        assertThat(next(p, session).get("question").get("questionId")).isEqualTo(first.get("question").get("questionId"));
    }

    @Test
    void answerRevealsOnlyInTheAnswerResponseAndASecondAnswerIs409() throws Exception {
        String p = player();
        var placement = fixtures.placement("History", "Kerala History");
        publish(placement, 10);
        UUID session = startOk(p, placement.topicId());
        JsonNode n = next(p, session);
        String id = n.get("question").get("questionId").asString();
        int version = n.get("question").get("version").asInt();
        int correct = shownCorrect(n);
        answer(p, session, id, version, correct).andExpect(status().isOk()).andExpect(jsonPath("$.correct").value(true))
                .andExpect(jsonPath("$.answerIndex").value(correct)).andExpect(jsonPath("$.explanation").exists())
                .andExpect(jsonPath("$.attribution").value("Kerala PSC test"))
                .andExpect(jsonPath("$.answeredCount").value(1)).andExpect(jsonPath("$.correctCount").value(1));
        answer(p, session, id, version, 0).andExpect(status().isConflict());
        // First result unchanged: the tally still reads 1 / 1.
        JsonNode second = next(p, session);
        assertThat(second.get("position").asInt()).isEqualTo(2);
        answer(p, session, id, version, 0).andExpect(status().isConflict());
        answer(p, session, UUID.randomUUID().toString(), 1, 0).andExpect(status().isConflict());
        answer(p, session, second.get("question").get("questionId").asString(), version, 9).andExpect(status().isBadRequest());
        answer(p, session, second.get("question").get("questionId").asString(), version, -1).andExpect(status().isBadRequest());
        mvc.perform(post("/api/core/v1/solo/sessions/" + session + "/end").header("Authorization", p))
                .andExpect(status().isOk()).andExpect(jsonPath("$.answeredCount").value(1)).andExpect(jsonPath("$.correctCount").value(1));
        mvc.perform(post("/api/core/v1/solo/sessions/" + session + "/end").header("Authorization", p)).andExpect(status().isNotFound());
    }

    @Test
    void twelveQuestionTopicNeverRepeatsWithinACycleAndReshufflesAfterwards() throws Exception {
        
        var placement = fixtures.placement("History", "Twelve");
        publish(placement, 12);
        for (int round = 0; round < 5; round++) {
            String p = player();
            UUID session = startOk(p, placement.topicId());
            Set<String> seen = new HashSet<>();
            String last = null;
            for (int i = 0; i < 12; i++) {
                last = serveAndAnswer(p, session, 1);
                assertThat(seen.add(last)).as("no repeat within a cycle").isTrue();
            }
            JsonNode again = next(p, session);
            assertThat(again.get("reshuffled").asBoolean()).isTrue();
            assertThat(again.get("question").get("questionId").asString()).isNotEqualTo(last);
            assertThat(again.get("position").asInt()).isEqualTo(13);
        }
    }

    @Test
    void softDeletedQuestionIsSkippedOnItsTurnAndAnOlderVersionStaysAnswerable() throws Exception {
        String p = player();
        var placement = fixtures.placement("History", "Kerala History");
        List<QuestionVersion> versions = publish(placement, 11);
        UUID session = startOk(p, placement.topicId());
        JsonNode n = next(p, session);
        String servedId = n.get("question").get("questionId").asString();
        int servedVersion = n.get("question").get("version").asInt();
        // Publish v2 of the served question after serving it: v1 stays answerable.
        QuestionVersion served = versions.stream().filter(v -> v.questionId().toString().equals(servedId)).findFirst().orElseThrow();
        fixtures.insertVersion(served.nextDraft(served.content(), Instant.now()).publish("Snobin", Instant.now()));
        answer(p, session, servedId, servedVersion, shownCorrect(n)).andExpect(status().isOk()).andExpect(jsonPath("$.correct").value(true));
        // Delete every other question but one: the rest are skipped, never served.
        List<String> remaining = new ArrayList<>(versions.stream().map(v -> v.questionId().toString()).filter(id -> !id.equals(servedId)).toList());
        String keep = remaining.remove(0);
        remaining.forEach(id -> fixtures.softDelete(UUID.fromString(id)));
        // The pool order is random but only `keep` survives besides the served one.
        JsonNode after = next(p, session);
        assertThat(after.get("question").get("questionId").asString()).isEqualTo(keep);
        assertThat(after.get("reshuffled").asBoolean()).isFalse();
        answer(p, session, keep, after.get("question").get("version").asInt(), 0).andExpect(status().isOk());
        JsonNode third = next(p, session);
        assertThat(third.get("reshuffled").asBoolean()).isTrue();
        // After the rebuild the served question's latest version (2) is what is served.
        assertThat(Set.of(servedId, keep)).contains(third.get("question").get("questionId").asString());
        if (third.get("question").get("questionId").asString().equals(servedId)) {
            assertThat(third.get("question").get("version").asInt()).isEqualTo(2);
        }
    }

    @Test
    void anotherPlayersExpiredAndUnknownSessionsAre404() throws Exception {
        var placement = fixtures.placement("History", "Kerala History");
        publish(placement, 10);
        String anju = player();
        String other = player();
        UUID session = startOk(anju, placement.topicId());
        JsonNode n = next(anju, session);
        String id = n.get("question").get("questionId").asString();
        mvc.perform(get("/api/core/v1/solo/sessions/" + session + "/next").header("Authorization", other)).andExpect(status().isNotFound());
        answer(other, session, id, 1, 0).andExpect(status().isNotFound());
        mvc.perform(post("/api/core/v1/solo/sessions/" + session + "/end").header("Authorization", other)).andExpect(status().isNotFound());
        mvc.perform(get("/api/core/v1/solo/sessions/" + UUID.randomUUID() + "/next").header("Authorization", anju)).andExpect(status().isNotFound());
        store.expire(session);
        mvc.perform(get("/api/core/v1/solo/sessions/" + session + "/next").header("Authorization", anju)).andExpect(status().isNotFound());
    }

    @Test
    void startingAgainEndsTheEarlierSession() throws Exception {
        var placement = fixtures.placement("History", "Kerala History");
        publish(placement, 10);
        String p = player();
        UUID first = startOk(p, placement.topicId());
        UUID second = startOk(p, placement.topicId());
        mvc.perform(get("/api/core/v1/solo/sessions/" + first + "/next").header("Authorization", p)).andExpect(status().isNotFound());
        mvc.perform(get("/api/core/v1/solo/sessions/" + second + "/next").header("Authorization", p)).andExpect(status().isOk());
    }

    @Test
    void guestIs403AndNoTokenIs401OnEveryEndpoint() throws Exception {
        String guest = "Bearer " + guestTokens.issue("en").accessToken();
        UUID id = UUID.randomUUID();
        for (String auth : new String[] {guest, null}) {
            int expected = auth == null ? 401 : 403;
            var start = post("/api/core/v1/solo/sessions").contentType(MediaType.APPLICATION_JSON).content("{}");
            var next = get("/api/core/v1/solo/sessions/" + id + "/next");
            var ans = post("/api/core/v1/solo/sessions/" + id + "/answers").contentType(MediaType.APPLICATION_JSON).content("{}");
            var end = post("/api/core/v1/solo/sessions/" + id + "/end");
            for (var request : List.of(start, next, ans, end)) {
                if (auth != null) {
                    request.header("Authorization", auth);
                }
                mvc.perform(request).andExpect(status().is(expected));
            }
        }
    }

    @Test
    void aTwentyQuestionSessionLeavesOutboxAndRecentTopicsUntouched() throws Exception {
        var placement = fixtures.placement("History", "Kerala History");
        publish(placement, 12);
        String p = player();
        long before = jdbc.sql("SELECT (SELECT count(*) FROM event_outbox) + (SELECT count(*) FROM recent_topic)").query(Long.class).single();
        UUID session = startOk(p, placement.topicId());
        for (int i = 0; i < 20; i++) {
            serveAndAnswer(p, session, i % 4);
        }
        mvc.perform(post("/api/core/v1/solo/sessions/" + session + "/end").header("Authorization", p))
                .andExpect(jsonPath("$.answeredCount").value(20));
        long after = jdbc.sql("SELECT (SELECT count(*) FROM event_outbox) + (SELECT count(*) FROM recent_topic)").query(Long.class).single();
        assertThat(after).isEqualTo(before);
    }

    @Test
    void startAndNextBucketsRefuseWith429AndRetryAfterPerPlayer() throws Exception {
        var placement = fixtures.placement("History", "Kerala History");
        publish(placement, 10);
        String hammer = player();
        for (int i = 0; i < 10; i++) {
            start(hammer, placement.topicId()).andExpect(status().isCreated());
        }
        start(hammer, placement.topicId()).andExpect(status().isTooManyRequests())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Content-Type", "application/problem+json"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().exists("Retry-After"))
                .andExpect(jsonPath("$.status").value(429));
        start(player(), placement.topicId()).andExpect(status().isCreated());

        String other = player();
        UUID session = startOk(other, placement.topicId());
        for (int i = 0; i < 60; i++) {
            mvc.perform(get("/api/core/v1/solo/sessions/" + session + "/next").header("Authorization", other)).andExpect(status().isOk());
        }
        var refused = mvc.perform(get("/api/core/v1/solo/sessions/" + session + "/next").header("Authorization", other))
                .andExpect(status().isTooManyRequests())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Content-Type", "application/problem+json"))
                .andReturn().getResponse();
        assertThat(Long.parseLong(refused.getHeader("Retry-After"))).isPositive();
        String fresh = player();
        UUID freshSession = startOk(fresh, placement.topicId());
        mvc.perform(get("/api/core/v1/solo/sessions/" + freshSession + "/next").header("Authorization", fresh)).andExpect(status().isOk());
    }
}
