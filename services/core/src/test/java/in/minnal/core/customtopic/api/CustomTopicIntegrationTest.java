package in.minnal.core.customtopic.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.support.PostgresIntegrationTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

class CustomTopicIntegrationTest extends PostgresIntegrationTest {

    static final String URL = "/api/core/v1/me/custom-topics";

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired JsonMapper mapper;

    UUID userId;

    /** A registered player; with a saved profile unless {@code withProfile} is false. */
    String player(boolean withProfile) {
        userId = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', NULL, 'Rajeev', :t, :t)")
                .param("id", userId).param("t", Timestamp.from(Instant.now())).update();
        if (withProfile) {
            jdbc.sql("INSERT INTO user_profile (user_id, display_name, district, exam_level, language, updated_at) VALUES (:id, 'Rajeev', 'Kollam', 'DEGREE', 'en', :t)")
                    .param("id", userId).param("t", Timestamp.from(Instant.now())).update();
        }
        return "Bearer " + userTokens.issue(new Account(userId, null, "Rajeev"), "en").accessToken();
    }

    String player() {
        return player(true);
    }

    static String question(String text, int answer) {
        return "{\"question\":\"" + text + "\",\"options\":[\"a\",\"b\",\"c\",\"d\"],\"answer\":" + answer + ",\"explanation\":\"Because.\"}";
    }

    static String topic(String name, int count) {
        List<String> qs = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            qs.add(question("Question " + i + "?", i % 4));
        }
        return "{\"topic\":\"" + name + "\",\"questions\":[" + String.join(",", qs) + "]}";
    }

    ResultActions send(String auth, String name, String json) throws Exception {
        var request = post(URL).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(new java.util.LinkedHashMap<>(java.util.Map.of("name", name, "json", json))));
        if (auth != null) {
            request.header("Authorization", auth);
        }
        return mvc.perform(request);
    }

    int count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Integer.class).single();
    }

    void assertNothingStored() {
        assertThat(count("custom_topic")).isZero();
        assertThat(count("custom_question")).isZero();
    }

    /** A topic row written straight to the table, to put a player near a cap. */
    void seedTopic(UUID owner, String name, int questions) {
        jdbc.sql("INSERT INTO custom_topic (id, owner_user_id, name, name_key, question_count, revision, created_at, updated_at) VALUES (:id, :o, :n, :k, :c, 1, :t, :t)")
                .param("id", UUID.randomUUID()).param("o", owner).param("n", name).param("k", name.toLowerCase()).param("c", questions)
                .param("t", Timestamp.from(Instant.now())).update();
    }

    @Test
    void anImportStoresTheTopicAndItsQuestionsAndReturnsUsage() throws Exception {
        String p = player();
        send(p, "Renaissance", topic("ignored", 3)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Renaissance")).andExpect(jsonPath("$.questionCount").value(3))
                .andExpect(jsonPath("$.revision").value(1)).andExpect(jsonPath("$.customTopicId").exists())
                .andExpect(jsonPath("$.usage.topics").value(1)).andExpect(jsonPath("$.usage.topicCap").value(50))
                .andExpect(jsonPath("$.usage.questions").value(3)).andExpect(jsonPath("$.usage.questionCap").value(500))
                .andExpect(jsonPath("$.usage.warn").value(false));
        assertThat(count("custom_topic")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT position || ':' || lang || ':' || answer_index FROM custom_question ORDER BY position").query(String.class).list())
                .containsExactly("1:en:0", "2:en:1", "3:en:2");
    }

    @Test
    void malayalamTextIsStoredAsWrittenWithTheMalayalamLanguage() throws Exception {
        String json = "{\"questions\":[{\"question\":\"കേരളത്തിലെ ഏറ്റവും വലിയ നദി ഏത്?\",\"options\":[\"പെരിയാർ\",\"പമ്പ\",\"ഭാരതപ്പുഴ\",\"ചാലിയാർ\"],\"answer\":0,\"explanation\":\"പെരിയാർ.\"}]}";
        send(player(), "നദികൾ", json).andExpect(status().isCreated());
        assertThat(jdbc.sql("SELECT lang FROM custom_question").query(String.class).single()).isEqualTo("ml");
        assertThat(jdbc.sql("SELECT option_a FROM custom_question").query(String.class).single()).isEqualTo("പെരിയാർ");
    }

    @Test
    void aSyntaxErrorGivesOneErrorWithLineColumnAndCauseAndStoresNothing() throws Exception {
        send(player(), "T", "{\n  \"questions\": [\n    {\"question\": \"Q?\" \"options\": []}\n  ]\n}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.length()").value(1)).andExpect(jsonPath("$.errors[0].line").value(3))
                .andExpect(jsonPath("$.errors[0].column").exists())
                .andExpect(jsonPath("$.errors[0].problem").value(org.hamcrest.Matchers.containsString("Missing comma")));
        assertNothingStored();
    }

    @Test
    void everyProblemIsReportedAtOnceWithTheQuestionNumberAndLine() throws Exception {
        String json = "{\"questions\": [\n"
                + question("Fine?", 0) + ",\n"
                + "{\"question\":\"Q2?\",\"options\":[\"a\",\"b\",\"c\"],\"answer\":0,\"explanation\":\"E\"},\n"
                + "{\"question\":\"Q3?\",\"options\":[\"a\",\"b\",\"c\",\"d\"],\"answer\":4,\"explanation\":\" \"}\n]}";
        send(player(), "T", json).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.item==2 && @.field=='options')].line").value(3))
                .andExpect(jsonPath("$.errors[?(@.item==3 && @.field=='answer')]").exists())
                .andExpect(jsonPath("$.errors[?(@.item==3 && @.field=='explanation')]").exists())
                .andExpect(jsonPath("$.errors[0].fix").exists());
        assertNothingStored();
    }

    @Test
    void zeroQuestionsAMissingQuestionsListAndABadTopicTypeAreRefused() throws Exception {
        String p = player();
        send(p, "T", "{\"questions\": []}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("questions"));
        send(p, "T", "{\"topic\": \"x\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("questions"));
        send(p, "T", "{\"topic\": 5, \"questions\": [" + question("Q?", 0) + "]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("topic"));
        assertNothingStored();
    }

    @Test
    void theNameComesFromTheRequestOrTheTopicKeyAndMustBeUniquePerOwner() throws Exception {
        String p = player();
        send(p, "", topic("From JSON", 1)).andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("From JSON"));
        send(p, "  from json ", topic("x", 1)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("name"))
                .andExpect(jsonPath("$.errors[0].problem").value("You already have a topic called 'from json'"));
        send(p, "n".repeat(81), topic("x", 1)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("name"));
        send(p, "", "{\"questions\":[" + question("Q?", 0) + "]}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("name"));
        assertThat(count("custom_topic")).isEqualTo(1);
        // another player may use the same name
        send(player(), "From JSON", topic("x", 1)).andExpect(status().isCreated());
    }

    @Test
    void theFiftyFirstTopicIsRefusedWith422NamingTheCap() throws Exception {
        String p = player();
        for (int i = 0; i < 50; i++) {
            seedTopic(userId, "Topic " + i, 1);
        }
        send(p, "One more", topic("x", 1)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("urn:minnal:problem:custom-topic-cap"))
                .andExpect(jsonPath("$.detail").value("You have 50 of 50 topics. Delete one to import a new topic."));
        assertThat(count("custom_topic")).isEqualTo(50);
    }

    @Test
    void anImportPastTheQuestionCapIsRefusedWithTheOvershoot() throws Exception {
        String p = player();
        seedTopic(userId, "Big", 495);
        send(p, "Six", topic("x", 6)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("urn:minnal:problem:custom-topic-cap"))
                .andExpect(jsonPath("$.detail").value("This import has 6 questions. You have 495 of 500 left, so remove 1 questions or delete an old topic."));
        assertThat(count("custom_question")).isZero();
        send(p, "Five", topic("x", 5)).andExpect(status().isCreated()).andExpect(jsonPath("$.usage.questions").value(500))
                .andExpect(jsonPath("$.usage.warn").value(true));
    }

    @Test
    void twoImportsAtOnceCannotBothPassTheQuestionCap() throws Exception {
        String p = player();
        seedTopic(userId, "Big", 490);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);
        List<Callable<Integer>> jobs = new ArrayList<>();
        for (String name : List.of("A", "B")) {
            jobs.add(() -> {
                go.await();
                return send(p, name, topic("x", 6)).andReturn().getResponse().getStatus();
            });
        }
        List<Future<Integer>> futures = new ArrayList<>();
        for (Callable<Integer> job : jobs) {
            futures.add(pool.submit(job));
        }
        go.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : futures) {
            statuses.add(f.get());
        }
        pool.shutdown();
        assertThat(statuses).containsExactlyInAnyOrder(201, 422);
        assertThat(jdbc.sql("SELECT coalesce(sum(question_count), 0) FROM custom_topic").query(Integer.class).single()).isEqualTo(496);
    }

    @Test
    void aDatabaseFailureOnTheLastOfFiveHundredQuestionsStoresNothingAndKeepsUsage() throws Exception {
        String p = player();
        List<String> qs = new ArrayList<>();
        for (int i = 0; i < 499; i++) {
            qs.add(question("Question " + i + "?", 0));
        }
        // Postgres cannot store a NUL character, so the last insert fails after 499 were written.
        qs.add(question("Bad\\u0000nul?", 0));
        send(p, "Five hundred", "{\"questions\":[" + String.join(",", qs) + "]}").andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("nothing was imported")));
        assertNothingStored();
        mvc.perform(get(URL + "/usage").header("Authorization", p)).andExpect(status().isOk())
                .andExpect(jsonPath("$.topics").value(0)).andExpect(jsonPath("$.questions").value(0));
    }

    @Test
    void guestIs403NoTokenIs401AndAProfilelessPlayerIs403ProfileRequired() throws Exception {
        send("Bearer " + guestTokens.issue("en").accessToken(), "T", topic("x", 1)).andExpect(status().isForbidden());
        send(null, "T", topic("x", 1)).andExpect(status().isUnauthorized());
        send(player(false), "T", topic("x", 1)).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PROFILE_REQUIRED"));
        mvc.perform(get(URL + "/usage")).andExpect(status().isUnauthorized());
        assertNothingStored();
    }

    @Test
    void theTwentyFirstImportInTheHourIs429WithRetryAfter() throws Exception {
        String p = player();
        for (int i = 0; i < 20; i++) {
            send(p, "T" + i, topic("x", 1)).andExpect(status().isCreated());
        }
        send(p, "T21", topic("x", 1)).andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
        assertThat(count("custom_topic")).isEqualTo(20);
    }

    @Test
    void rejectedImportsGiveTheirTokenBackSoMistakesDoNotUseTheHour() throws Exception {
        String p = player();
        for (int i = 0; i < 25; i++) {
            send(p, "T", "{ not json").andExpect(status().isBadRequest());
        }
        send(p, "T", topic("x", 1)).andExpect(status().isCreated());
    }

    @Test
    void aBodyOverOneMegabyteIs413() throws Exception {
        String p = player();
        String big = "{\"questions\":[{\"question\":\"" + "x".repeat(1_100_000) + "\"}]}";
        send(p, "T", big).andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.detail").value("Paste is too large (over 1 MB). Split it into smaller topics."));
        assertNothingStored();
    }

    @Test
    void usageReportsTheCountsAndWarnsAtEightyPercent() throws Exception {
        String p = player();
        mvc.perform(get(URL + "/usage").header("Authorization", p)).andExpect(status().isOk())
                .andExpect(jsonPath("$.topics").value(0)).andExpect(jsonPath("$.topicCap").value(50)).andExpect(jsonPath("$.warn").value(false));
        seedTopic(userId, "Big", 400);
        mvc.perform(get(URL + "/usage").header("Authorization", p)).andExpect(jsonPath("$.questions").value(400)).andExpect(jsonPath("$.warn").value(true));
    }

    @Test
    void deletingTheAccountDeletesItsCustomTopicsAndQuestions() throws Exception {
        String p = player();
        send(p, "Mine", topic("x", 3)).andExpect(status().isCreated());
        send(player(), "Theirs", topic("x", 2)).andExpect(status().isCreated());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/core/v1/me").header("Authorization", p))
                .andExpect(status().isNoContent());
        assertThat(count("custom_topic")).isEqualTo(1);
        assertThat(count("custom_question")).isEqualTo(2);
    }

    @Test
    void anotherPlayersTopicsDoNotCountAgainstMe() throws Exception {
        send(player(), "Theirs", topic("x", 5)).andExpect(status().isCreated());
        String mine = player();
        mvc.perform(get(URL + "/usage").header("Authorization", mine)).andExpect(jsonPath("$.topics").value(0)).andExpect(jsonPath("$.questions").value(0));
    }

    // ---- Story 6.3: list, read, replace, delete ----

    String created(String auth, String name, int questions) throws Exception {
        var result = send(auth, name, topic("ignored", questions)).andExpect(status().isCreated()).andReturn();
        return mapper.readTree(result.getResponse().getContentAsString()).get("customTopicId").asString();
    }

    ResultActions put(String auth, String id, String name, String json) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(URL + "/" + id).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(java.util.Map.of("name", name, "json", json)));
        if (auth != null) {
            request.header("Authorization", auth);
        }
        return mvc.perform(request);
    }

    ResultActions request(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder, String auth) throws Exception {
        if (auth != null) {
            builder.header("Authorization", auth);
        }
        return mvc.perform(builder);
    }

    @Test
    void theListHasOnlyMyTopicsNewestFirstWithUsage() throws Exception {
        String mine = player();
        UUID me = userId;
        created(mine, "Older", 2);
        Thread.sleep(15);
        created(mine, "Newer", 3);
        created(player(), "Someone else's", 4);
        request(get(URL), mine).andExpect(status().isOk())
                .andExpect(jsonPath("$.topics.length()").value(2)).andExpect(jsonPath("$.topics[0].name").value("Newer"))
                .andExpect(jsonPath("$.topics[0].questionCount").value(3)).andExpect(jsonPath("$.topics[0].updatedAt").exists())
                .andExpect(jsonPath("$.topics[1].name").value("Older"))
                .andExpect(jsonPath("$.usage.topics").value(2)).andExpect(jsonPath("$.usage.questions").value(5));
        assertThat(me).isNotNull();
    }

    @Test
    void readingATopicReturnsItsQuestionsInOrder() throws Exception {
        String p = player();
        String id = created(p, "Read me", 3);
        request(get(URL + "/" + id), p).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Read me")).andExpect(jsonPath("$.questionCount").value(3)).andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.questions.length()").value(3)).andExpect(jsonPath("$.questions[0].position").value(1))
                .andExpect(jsonPath("$.questions[0].options.length()").value(4)).andExpect(jsonPath("$.questions[1].answerIndex").value(1))
                .andExpect(jsonPath("$.questions[2].explanation").value("Because.")).andExpect(jsonPath("$.questions[0].lang").value("en"));
    }

    @Test
    void anotherPlayersTopicAnAnUnknownAndAMalformedIdAllGetTheSame404() throws Exception {
        String theirs = player();
        String id = created(theirs, "Theirs", 2);
        String me = player();
        String missing = UUID.randomUUID().toString();
        for (String target : new String[] {id, missing, "not-a-uuid"}) {
            request(get(URL + "/" + target), me).andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.type").value("urn:minnal:problem:not-found")).andExpect(jsonPath("$.detail").value("Topic not found."));
            put(me, target, "X", topic("x", 1)).andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("Topic not found."));
            request(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(URL + "/" + target), me)
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("Topic not found."));
        }
        assertThat(count("custom_topic")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT name FROM custom_topic").query(String.class).single()).isEqualTo("Theirs");
        assertThat(count("custom_question")).isEqualTo(2);
    }

    @Test
    void everyNewEndpointRefusesAGuestAndNoToken() throws Exception {
        String guest = "Bearer " + guestTokens.issue("en").accessToken();
        String id = UUID.randomUUID().toString();
        for (String auth : new String[] {guest, null}) {
            int expected = auth == null ? 401 : 403;
            request(get(URL), auth).andExpect(status().is(expected));
            request(get(URL + "/" + id), auth).andExpect(status().is(expected));
            put(auth, id, "X", topic("x", 1)).andExpect(status().is(expected));
            request(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(URL + "/" + id), auth).andExpect(status().is(expected));
        }
    }

    @Test
    void replacingSwapsTheQuestionsBumpsTheRevisionAndFreesTheOldOnesAgainstTheCap() throws Exception {
        String p = player();
        UUID me = userId;
        seedTopic(me, "Elsewhere", 440);
        String id = created(p, "Mine", 5);
        // 440 + 5 used; replacing with 60 would be 500: allowed because the old 5 are freed
        put(p, id, "Mine renamed", topic("x", 60)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Mine renamed")).andExpect(jsonPath("$.questionCount").value(60))
                .andExpect(jsonPath("$.revision").value(2)).andExpect(jsonPath("$.usage.questions").value(500)).andExpect(jsonPath("$.usage.topics").value(2));
        assertThat(jdbc.sql("SELECT count(*) FROM custom_question WHERE custom_topic_id = :t").param("t", UUID.fromString(id)).query(Integer.class).single()).isEqualTo(60);
        request(get(URL + "/" + id), p).andExpect(jsonPath("$.name").value("Mine renamed")).andExpect(jsonPath("$.revision").value(2));
        // the same name is not a clash with itself
        put(p, id, "Mine renamed", topic("x", 2)).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(3));
    }

    @Test
    void aReplacementOverTheCapIs422AndChangesNothing() throws Exception {
        String p = player();
        UUID me = userId;
        seedTopic(me, "Elsewhere", 440);
        String id = created(p, "Mine", 5);
        put(p, id, "Mine", topic("x", 61)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("urn:minnal:problem:custom-topic-cap"));
        request(get(URL + "/" + id), p).andExpect(jsonPath("$.questionCount").value(5)).andExpect(jsonPath("$.revision").value(1));
    }

    @Test
    void aFailedReplacementKeepsTheOldNameQuestionsAndRevision() throws Exception {
        String p = player();
        String id = created(p, "Keep me", 3);
        created(p, "Other topic", 1);
        // name clash with another of my topics
        put(p, id, "other TOPIC", topic("x", 2)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("name"));
        // field errors and a syntax error
        put(p, id, "Keep me", "{\"questions\":[{\"question\":\"Q?\",\"options\":[\"a\"],\"answer\":9,\"explanation\":\"E\"}]}").andExpect(status().isBadRequest());
        put(p, id, "Keep me", "{ not json").andExpect(status().isBadRequest());
        // a database failure on the last of many questions
        List<String> qs = new ArrayList<>();
        for (int i = 0; i < 49; i++) {
            qs.add(question("Question " + i + "?", 0));
        }
        qs.add(question("Bad\\u0000nul?", 0));
        put(p, id, "Keep me", "{\"questions\":[" + String.join(",", qs) + "]}").andExpect(status().isInternalServerError());
        request(get(URL + "/" + id), p).andExpect(jsonPath("$.name").value("Keep me")).andExpect(jsonPath("$.questionCount").value(3))
                .andExpect(jsonPath("$.revision").value(1)).andExpect(jsonPath("$.questions.length()").value(3));
    }

    @Test
    void deletingRemovesTheTopicAndItsQuestionsThenItIsGone() throws Exception {
        String p = player();
        String id = created(p, "Delete me", 4);
        String other = created(player(), "Keep", 2);
        request(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(URL + "/" + id), p).andExpect(status().isNoContent());
        assertThat(count("custom_topic")).isEqualTo(1);
        assertThat(count("custom_question")).isEqualTo(2);
        request(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(URL + "/" + id), p).andExpect(status().isNotFound());
        request(get(URL), p).andExpect(jsonPath("$.topics.length()").value(0)).andExpect(jsonPath("$.usage.questions").value(0));
        assertThat(other).isNotBlank();
    }
}
