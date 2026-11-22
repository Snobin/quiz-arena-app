package in.minnal.core.question.api.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import in.minnal.core.question.domain.ContentCategory;
import in.minnal.core.question.domain.ExamLevel;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.support.PostgresIntegrationTest;
import in.minnal.core.support.QuestionFixtures;
import in.minnal.core.support.QuestionFixtures.Placement;
import java.net.URI;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

class QuestionSetEndpointIntegrationTest extends PostgresIntegrationTest {

    static final String TOKEN = "it-internal-token";

    @Autowired
    MockMvc mvc;

    @Autowired
    QuestionFixtures fixtures;

    static String body(String source, String filters, Object count) {
        return """
                {"source": %s, "filters": %s, "count": %s, "requesterId": "player-1"}""".formatted(source, filters, count);
    }

    static String bank(int count) {
        return body("\"BANK\"", "{\"category\": \"KERALA_PSC\"}", count);
    }

    ResultActions request(String json) throws Exception {
        return requestWithToken(json, TOKEN);
    }

    ResultActions requestWithToken(String json, String token) throws Exception {
        var builder = post("/internal/question-sets").contentType(MediaType.APPLICATION_JSON).content(json);
        if (token != null) {
            builder.header("X-Internal-Token", token);
        }
        return mvc.perform(builder);
    }

    List<QuestionVersion> publish(int n, Placement placement) {
        return java.util.stream.IntStream.range(0, n).mapToObj(i -> fixtures.published(placement, placement.subjectId() + "-" + i)).toList();
    }

    @Test
    void drawsExactlyCountDistinctLatestPublishedQuestions() throws Exception {
        List<QuestionVersion> pool = new java.util.ArrayList<>();
        pool.addAll(publish(8, fixtures.placement("Kerala Geography", "Rivers")));
        pool.addAll(publish(7, fixtures.placement("General Science", "Physics")));
        Map<String, QuestionVersion> byId = pool.stream().collect(Collectors.toMap(v -> v.questionId().toString(), v -> v));

        String json = request(bank(10))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.questions.length()").value(10))
                .andReturn().getResponse().getContentAsString();

        List<Map<String, Object>> questions = JsonPath.read(json, "$.questions");
        assertThat(questions.stream().map(q -> q.get("questionId")).collect(Collectors.toSet())).hasSize(10);
        for (Map<String, Object> q : questions) {
            QuestionVersion expected = byId.get((String) q.get("questionId"));
            assertThat(expected).isNotNull();
            assertThat(q.get("version")).isEqualTo(1);
            assertThat(q.get("textEn")).isEqualTo(expected.content().textEn());
            // The option order is shuffled per draw: the same four options, and the answer index still points at the stored answer.
            @SuppressWarnings("unchecked")
            List<String> shown = (List<String>) q.get("options");
            assertThat(shown).containsExactlyInAnyOrderElementsOf(expected.content().options());
            assertThat(shown.get((Integer) q.get("answerIndex"))).isEqualTo(expected.content().options().get(2));
            assertThat(q.get("explanation")).isEqualTo(expected.content().explanation());
            assertThat(q.get("attribution")).isEqualTo("Kerala PSC test");
            assertThat(q).containsOnlyKeys("questionId", "version", "textMl", "textEn", "options", "answerIndex", "explanation", "attribution", "topicId");
            assertThat(q.get("topicId")).isEqualTo(expected.content().topicId().toString());
        }
    }

    @Test
    void repeatedDrawsReturnDifferentMixes() throws Exception {
        publish(20, fixtures.placement("Kerala Geography", "Rivers"));
        publish(20, fixtures.placement("Indian History", "Freedom struggle"));

        // Compared as sets: a reshuffle of the same 10 questions is not a new mix.
        Set<Set<String>> draws = new HashSet<>();
        for (int i = 0; i < 5; i++) {
            String json = request(bank(10)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            List<String> ids = JsonPath.read(json, "$.questions[*].questionId");
            draws.add(Set.copyOf(ids));
        }
        assertThat(draws).hasSizeGreaterThan(1);
    }

    @Test
    void bilingualQuestionKeepsBothTexts() throws Exception {
        Placement placement = fixtures.placement("Kerala Geography", "Rivers");
        QuestionVersion stored = fixtures.published(placement, ContentCategory.KERALA_PSC, ExamLevel.TENTH,
                "കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏതാണ്?", "Which is the longest river in Kerala?");

        request(bank(1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].questionId").value(stored.questionId().toString()))
                .andExpect(jsonPath("$.questions[0].textMl").value("കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏതാണ്?"))
                .andExpect(jsonPath("$.questions[0].textEn").value("Which is the longest river in Kerala?"));
    }

    @Test
    void shortPoolIs422AndNeverAShortSet() throws Exception {
        publish(9, fixtures.placement("Kerala Geography", "Rivers"));

        request(bank(10))
                .andExpect(status().isUnprocessableContent())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(422))
                .andExpect(jsonPath("$.questions").doesNotExist());
    }

    @Test
    void draftDiscardedAndDeletedQuestionsAreNeverServed() throws Exception {
        Placement placement = fixtures.placement("Kerala Geography", "Rivers");
        QuestionVersion v1 = fixtures.published(placement, "published v1");
        fixtures.insertVersion(v1.nextDraft(fixtures.content(placement, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "draft v2"), Instant.now()));
        QuestionVersion deleted = fixtures.published(placement, "deleted");
        fixtures.softDelete(deleted.questionId());
        fixtures.draft(placement, "draft only");
        fixtures.discarded(placement, "discarded");

        request(bank(1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].questionId").value(v1.questionId().toString()))
                .andExpect(jsonPath("$.questions[0].version").value(1))
                .andExpect(jsonPath("$.questions[0].textEn").value("published v1"));
        request(bank(2)).andExpect(status().isUnprocessableContent());
    }

    @Test
    void servesTheLatestPublishedVersion() throws Exception {
        Placement placement = fixtures.placement("Kerala Geography", "Rivers");
        QuestionVersion v1 = fixtures.published(placement, "v1");
        QuestionVersion v2 = v1.nextDraft(fixtures.content(placement, ContentCategory.KERALA_PSC, ExamLevel.TENTH, "v2"), Instant.now())
                .publish("Snobin", Instant.now());
        fixtures.insertVersion(v2);

        request(bank(1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].version").value(2))
                .andExpect(jsonPath("$.questions[0].textEn").value("v2"));
    }

    @Test
    void filtersNarrowThePool() throws Exception {
        Placement rivers = fixtures.placement("Kerala Geography", "Rivers");
        Placement districts = fixtures.placement("Kerala Geography", "Districts");
        Placement physics = fixtures.placement("General Science", "Physics");
        publish(3, rivers);
        publish(2, districts);
        publish(4, physics);
        fixtures.published(physics, ContentCategory.KERALA_PSC, ExamLevel.DEGREE, "degree physics");
        fixtures.published(physics, ContentCategory.SCHOOL_QUIZ, ExamLevel.TENTH, "school quiz");

        String geography = "{\"category\": \"KERALA_PSC\", \"subjectId\": \"%s\"}".formatted(rivers.subjectId());
        request(body("\"BANK\"", geography, 5)).andExpect(status().isOk()).andExpect(jsonPath("$.questions.length()").value(5));
        request(body("\"BANK\"", geography, 6)).andExpect(status().isUnprocessableContent());

        String topic = "{\"category\": \"KERALA_PSC\", \"topicId\": \"%s\"}".formatted(districts.topicId());
        request(body("\"BANK\"", topic, 2)).andExpect(status().isOk());
        request(body("\"BANK\"", topic, 3)).andExpect(status().isUnprocessableContent());

        String degree = "{\"category\": \"KERALA_PSC\", \"examLevel\": \"DEGREE\"}";
        request(body("\"BANK\"", degree, 1)).andExpect(jsonPath("$.questions[0].textEn").value("degree physics"));
        request(body("\"BANK\"", degree, 2)).andExpect(status().isUnprocessableContent());

        request(body("\"BANK\"", "{\"category\": \"SCHOOL_QUIZ\"}", 1)).andExpect(jsonPath("$.questions[0].textEn").value("school quiz"));
        request(bank(11)).andExpect(status().isUnprocessableContent());
        request(bank(10)).andExpect(status().isOk());
    }

    @Test
    void aTopicFilterReturnsOnlyThatTopicWithAdditiveTopicBlock() throws Exception {
        Placement rivers = fixtures.placement("Kerala Geography", "Rivers");
        Placement districts = fixtures.placement("Kerala Geography", "Districts");
        for (int i = 0; i < 12; i++) {
            fixtures.published(rivers, "rivers-" + i);
            fixtures.published(districts, "districts-" + i);
        }
        String topic = "{\"category\": \"KERALA_PSC\", \"topicId\": \"%s\"}".formatted(districts.topicId());
        request(body("\"BANK\"", topic, 10))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions.length()").value(10))
                .andExpect(jsonPath("$.questions[?(@.textEn =~ /^districts-.*/)]").value(org.hamcrest.Matchers.hasSize(10)))
                .andExpect(jsonPath("$.questions[?(@.topicId == '%s')]".formatted(districts.topicId())).value(org.hamcrest.Matchers.hasSize(10)))
                .andExpect(jsonPath("$.topic.topicId").value(districts.topicId().toString()))
                .andExpect(jsonPath("$.topic.name").value("Districts"))
                .andExpect(jsonPath("$.topic.subjectId").value(districts.subjectId().toString()))
                .andExpect(jsonPath("$.topic.subjectName").value("Kerala Geography"));
        request(bank(10)).andExpect(status().isOk()).andExpect(jsonPath("$.topic").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void anUnknownTopicIs422() throws Exception {
        publish(12, fixtures.placement("Kerala Geography", "Rivers"));
        String topic = "{\"category\": \"KERALA_PSC\", \"topicId\": \"%s\"}".formatted(java.util.UUID.randomUUID());
        request(body("\"BANK\"", topic, 10)).andExpect(status().isUnprocessableContent());
    }

    @Test
    void missingWrongOrEmptyTokenIs401ProblemDetail() throws Exception {
        publish(1, fixtures.placement("Kerala Geography", "Rivers"));
        for (String token : new String[] {null, "", "wrong-token", TOKEN + "x", TOKEN.substring(1)}) {
            requestWithToken(bank(1), token)
                    .andExpect(status().isUnauthorized())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(401));
        }
    }

    @Test
    void the401IsAStandardProblemDetailWithTheRequestId() throws Exception {
        mvc.perform(post("/internal/question-sets").contentType(MediaType.APPLICATION_JSON).content(bank(1))
                        .header("X-Request-Id", "it-req-401"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("X-Request-Id", "it-req-401"))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.instance").value("/internal/question-sets"))
                .andExpect(jsonPath("$.detail").value("missing or invalid internal service token"));
    }

    @Test
    void noUrlSpellingRoutesAroundTheToken() throws Exception {
        publish(3, fixtures.placement("Kerala Geography", "Rivers"));
        for (String path : List.of("/internal;x=1/question-sets", "/%69nternal/question-sets", "/internal/question-sets;x=1",
                "/internal//question-sets", "/INTERNAL/question-sets")) {
            int status = mvc.perform(post(URI.create(path)).contentType(MediaType.APPLICATION_JSON).content(bank(1)))
                    .andReturn().getResponse().getStatus();
            assertThat(status).as(path).isIn(401, 404);
        }
    }

    @Test
    void invalidRequestsAre400ProblemDetail() throws Exception {
        List<String> invalid = List.of(
                bank(0),
                bank(31),
                body("\"BANK\"", "{\"category\": \"KERALA_PSC\"}", "null"),
                body("\"BANK\"", "{}", 5),
                body("\"BANK\"", "null", 5),
                body("\"BANK\"", "{\"category\": \"NOPE\"}", 5),
                body("\"BANK\"", "{\"category\": \"KERALA_PSC\", \"examLevel\": \"NOPE\"}", 5),
                body("null", "{\"category\": \"KERALA_PSC\"}", 5),
                "{\"source\": \"BANK\", \"filters\": {\"category\": \"KERALA_PSC\"}, \"count\": 5}",
                "{\"source\": \"BANK\", \"filters\": {\"category\": \"KERALA_PSC\"}, \"count\": 5, \"requesterId\": \" \"}",
                "{\"source\": \"NOPE\", \"filters\": {\"category\": \"KERALA_PSC\"}, \"count\": 5, \"requesterId\": \"p\"}",
                "not json");
        for (String json : invalid) {
            request(json)
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(400));
        }
    }

    // Story 6.5a: the CUSTOM source.

    UUID user(String name) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', null, :n, :t, :t)")
                .param("id", id).param("n", name).param("t", java.sql.Timestamp.from(Instant.now())).update();
        return id;
    }

    UUID customTopic(UUID owner, String name, int questions, String lang, int revision) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO custom_topic (id, owner_user_id, name, name_key, question_count, revision, created_at, updated_at) VALUES (:id, :o, :n, :k, :c, :r, :t, :t)")
                .param("id", id).param("o", owner).param("n", name).param("k", name.toLowerCase()).param("c", questions).param("r", revision)
                .param("t", java.sql.Timestamp.from(Instant.now())).update();
        for (int i = 0; i < questions; i++) {
            jdbc.sql("INSERT INTO custom_question (id, custom_topic_id, position, text, lang, option_a, option_b, option_c, option_d, answer_index, explanation) VALUES (:id, :t, :p, :text, :lang, 'A', 'B', 'C', 'D', 2, 'Because')")
                    .param("id", UUID.randomUUID()).param("t", id).param("p", i + 1).param("text", "Own " + i).param("lang", lang).update();
        }
        return id;
    }

    static String custom(UUID topic, Object count, UUID requester) {
        return "{\"source\": \"CUSTOM\", \"customTopicId\": " + (topic == null ? "null" : "\"" + topic + "\"")
                + ", \"count\": " + count + ", \"requesterId\": \"" + requester + "\"}";
    }

    @Test
    void aCustomSetIsExactlyCountDistinctQuestionsFromTheOwnersTopicWithItsNameAndRevision() throws Exception {
        UUID owner = user("Rajeev");
        UUID topic = customTopic(owner, "Renaissance", 12, "ml", 3);
        String json = request(custom(topic, 8, owner)).andExpect(status().isOk())
                .andExpect(jsonPath("$.questions.length()").value(8))
                .andExpect(jsonPath("$.customTopic.customTopicId").value(topic.toString()))
                .andExpect(jsonPath("$.customTopic.name").value("Renaissance"))
                .andExpect(jsonPath("$.topic").value(org.hamcrest.Matchers.nullValue()))
                .andReturn().getResponse().getContentAsString();
        List<String> ids = JsonPath.read(json, "$.questions[*].questionId");
        assertThat(new HashSet<>(ids)).hasSize(8);
        assertThat((List<Integer>) JsonPath.read(json, "$.questions[*].version")).containsOnly(3);
        assertThat((List<String>) JsonPath.read(json, "$.questions[*].textMl")).allMatch(t -> t.startsWith("Own "));
        assertThat((List<Object>) JsonPath.read(json, "$.questions[*].textEn")).containsOnlyNulls();
        assertThat((List<Object>) JsonPath.read(json, "$.questions[*].attribution")).containsOnlyNulls();
        assertThat((List<Object>) JsonPath.read(json, "$.questions[*].topicId")).containsOnlyNulls();
        for (int i = 0; i < 8; i++) {
            int answer = JsonPath.read(json, "$.questions[" + i + "].answerIndex");
            assertThat((String) JsonPath.read(json, "$.questions[" + i + "].options[" + answer + "]")).isEqualTo("C");
        }
    }

    @Test
    void anEnglishQuestionGoesInTextEn() throws Exception {
        UUID owner = user("Rajeev");
        request(custom(customTopic(owner, "English", 5, "en", 1), 5, owner)).andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].textEn").isNotEmpty()).andExpect(jsonPath("$.questions[0].textMl").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void anotherPlayersAndAnUnknownTopicAreTheSame404() throws Exception {
        UUID owner = user("Rajeev");
        UUID other = user("Other");
        UUID topic = customTopic(owner, "Mine", 6, "en", 1);
        String foreign = request(custom(topic, 5, other)).andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)).andReturn().getResponse().getContentAsString();
        String unknown = request(custom(UUID.randomUUID(), 5, other)).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<String>read(foreign, "$.detail")).isEqualTo(JsonPath.<String>read(unknown, "$.detail"));
    }

    @Test
    void aTopicWithFewerThanCountQuestionsIs422AndNeverAShortSet() throws Exception {
        UUID owner = user("Rajeev");
        request(custom(customTopic(owner, "Small", 6, "en", 1), 7, owner)).andExpect(status().isUnprocessableContent());
    }

    @Test
    void aCustomRequestWithFiltersOrWithoutATopicIdOrWithABadRequesterIs400() throws Exception {
        UUID owner = user("Rajeev");
        UUID topic = customTopic(owner, "Mine", 6, "en", 1);
        request("{\"source\": \"CUSTOM\", \"customTopicId\": \"" + topic + "\", \"filters\": {\"category\": \"KERALA_PSC\"}, \"count\": 5, \"requesterId\": \"" + owner + "\"}")
                .andExpect(status().isBadRequest());
        request(custom(null, 5, owner)).andExpect(status().isBadRequest());
        request("{\"source\": \"CUSTOM\", \"customTopicId\": \"" + topic + "\", \"count\": 5, \"requesterId\": \"player-1\"}")
                .andExpect(status().isBadRequest());
        request(custom(topic, 0, owner)).andExpect(status().isBadRequest());
        request(custom(topic, 31, owner)).andExpect(status().isBadRequest());
    }

    @Test
    void aGuestIdCannotDrawACustomSetAndTheBankIsUntouched() throws Exception {
        UUID owner = user("Rajeev");
        UUID topic = customTopic(owner, "Mine", 6, "en", 1);
        request(custom(topic, 5, UUID.randomUUID())).andExpect(status().isNotFound());
        publish(5, fixtures.placement("Kerala Geography", "Rivers"));
        request(bank(5)).andExpect(status().isOk()).andExpect(jsonPath("$.customTopic").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void thirtyQuestionDrawOverTwoThousandRowsIsUnder500Ms() throws Exception {
        String[] subjects = {"Kerala Geography", "Indian Constitution", "General Science", "Kerala Renaissance", "Indian History"};
        for (int s = 0; s < subjects.length; s++) {
            Placement placement = fixtures.placement(subjects[s], "Topic " + s);
            publish(400, placement);
        }
        jdbc.sql("ANALYZE").update();
        request(bank(30)).andExpect(status().isOk()); // warm-up

        long worstMs = 0;
        for (int i = 0; i < 5; i++) {
            long start = System.nanoTime();
            request(bank(30)).andExpect(status().isOk()).andExpect(jsonPath("$.questions.length()").value(30));
            worstMs = Math.max(worstMs, (System.nanoTime() - start) / 1_000_000);
        }
        assertThat(worstMs).as("slowest 30-question draw over 2,000 questions (ms)").isLessThan(500);
    }
}
