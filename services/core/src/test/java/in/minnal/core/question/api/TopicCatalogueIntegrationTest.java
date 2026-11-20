package in.minnal.core.question.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.question.domain.QuestionVersion;
import in.minnal.core.support.PostgresIntegrationTest;
import in.minnal.core.support.QuestionFixtures;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Story 4.1: topic catalogue (9/10 boundary, ETag) and recent topics. */
class TopicCatalogueIntegrationTest extends PostgresIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired QuestionFixtures fixtures;
    @Autowired in.minnal.core.question.infrastructure.JdbcTopicCatalogueRepository catalogueRepository;
    @Autowired in.minnal.core.question.application.TopicThreshold threshold;
    @Autowired org.springframework.transaction.support.TransactionTemplate tx;
    @Autowired tools.jackson.databind.json.JsonMapper json;

    @Autowired in.minnal.core.question.application.TopicCatalogueService catalogueService;

    @org.junit.jupiter.api.BeforeEach
    void freshCatalogue() {
        catalogueService.invalidate();
    }

    UUID playerId;

    String player() {
        playerId = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', null, 'X', :t, :t)")
                .param("id", playerId).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(playerId, null, "P"), "en").accessToken();
    }

    ResultActions topics(String auth) throws Exception {
        var request = get("/api/core/v1/topics");
        if (auth != null) {
            request.header("Authorization", auth);
        }
        return mvc.perform(request);
    }

    List<QuestionVersion> publish(QuestionFixtures.Placement placement, int n) {
        return java.util.stream.IntStream.range(0, n).mapToObj(i -> fixtures.published(placement, "Q" + i + UUID.randomUUID())).toList();
    }

    static class MutableClock extends java.time.Clock {
        Instant now = Instant.now();
        public java.time.ZoneId getZone() { return java.time.ZoneOffset.UTC; }
        public java.time.Clock withZone(java.time.ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }

    @Test
    void topicIsHiddenAt9ListedAt10AndDropsAgainWithin60SecondsOfADelete() {
        MutableClock clock = new MutableClock();
        var service = new in.minnal.core.question.application.TopicCatalogueService(catalogueRepository, threshold, tx, clock, json);
        var placement = fixtures.placement("History", "Kerala History");
        List<QuestionVersion> nine = publish(placement, 9);
        for (int i = 0; i < 5; i++) {
            fixtures.draft(placement, "D" + i);
        }
        fixtures.discarded(placement, "X");
        var cat = in.minnal.core.question.domain.ContentCategory.KERALA_PSC;
        assertThat(service.catalogue(cat).body()).contains("\"subjects\":[]");
        QuestionVersion tenth = fixtures.published(placement, "tenth");
        // Cached for up to 60 s.
        clock.now = clock.now.plusSeconds(30);
        assertThat(service.catalogue(cat).body()).contains("\"subjects\":[]");
        clock.now = clock.now.plusSeconds(31);
        var listed = service.catalogue(cat);
        assertThat(listed.body()).contains("\"publishedCount\":10");
        // A recomputed but identical catalogue keeps the same ETag.
        clock.now = clock.now.plusSeconds(61);
        assertThat(service.catalogue(cat).etag()).isEqualTo(listed.etag());
        fixtures.softDelete(tenth.questionId());
        clock.now = clock.now.plusSeconds(61);
        assertThat(service.catalogue(cat).body()).contains("\"subjects\":[]");
        assertThat(nine).hasSize(9);
    }

    @Test
    void listedTopicCarriesCountSortedAndSubjectWithoutTopicsIsLeftOut() throws Exception {
        var a = fixtures.placement("Zoology", "Birds");
        var b = fixtures.placement("Art", "Painting");
        fixtures.placement("Empty", "Nothing");
        publish(a, 10);
        publish(b, 12);
        topics(player()).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "private, no-cache"))
                .andExpect(header().exists("ETag"))
                .andExpect(jsonPath("$.subjects.length()").value(2))
                .andExpect(jsonPath("$.subjects[0].name").value("Art"))
                .andExpect(jsonPath("$.subjects[0].topics[0].name").value("Painting"))
                .andExpect(jsonPath("$.subjects[0].topics[0].publishedCount").value(12))
                .andExpect(jsonPath("$.subjects[1].name").value("Zoology"));
    }

    @Test
    void matchingIfNoneMatchGets304WithNoBody() throws Exception {
        publish(fixtures.placement("Art", "Painting"), 10);
        String p = player();
        String etag = topics(p).andExpect(status().isOk()).andReturn().getResponse().getHeader("ETag");
        assertThat(etag).startsWith("\"");
        var response = mvc.perform(get("/api/core/v1/topics").header("Authorization", p).header("If-None-Match", etag))
                .andExpect(status().isNotModified()).andReturn().getResponse();
        assertThat(response.getContentAsString()).isEmpty();
        mvc.perform(get("/api/core/v1/topics").header("Authorization", p).header("If-None-Match", "\"other\"")).andExpect(status().isOk());
    }

    @Test
    void guestIs403NoTokenIs401AndUnknownCategoryIs400() throws Exception {
        topics("Bearer " + guestTokens.issue("en").accessToken()).andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
        topics(null).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401));
        mvc.perform(get("/api/core/v1/me/recent-topics")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/core/v1/me/recent-topics").header("Authorization", "Bearer " + guestTokens.issue("en").accessToken()))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/core/v1/me/recent-topics/" + UUID.randomUUID()).header("Authorization", "Bearer " + guestTokens.issue("en").accessToken()))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/core/v1/me/recent-topics/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/core/v1/topics?category=NOPE").header("Authorization", player())).andExpect(status().isBadRequest());
    }

    @Test
    void recentTopicsKeepFiveNewestReturnThreeEligibleAndUnknownTopicIs404() throws Exception {
        String p = player();
        List<QuestionFixtures.Placement> placements = new java.util.ArrayList<>();
        for (int i = 0; i < 6; i++) {
            var placement = fixtures.placement("Subject", "Topic " + i);
            publish(placement, 10);
            placements.add(placement);
        }
        for (var placement : placements) {
            mvc.perform(put("/api/core/v1/me/recent-topics/" + placement.topicId()).header("Authorization", p)).andExpect(status().isNoContent());
            Thread.sleep(5);
        }
        assertThat(jdbc.sql("SELECT count(*) FROM recent_topic WHERE user_id = :u").param("u", playerId).query(Long.class).single()).isEqualTo(5);
        assertThat(jdbc.sql("SELECT count(*) FROM recent_topic WHERE topic_id = :t").param("t", placements.get(0).topicId()).query(Long.class).single()).isZero();
        mvc.perform(get("/api/core/v1/me/recent-topics").header("Authorization", p)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].topicId").value(placements.get(5).topicId().toString()))
                .andExpect(jsonPath("$[0].subjectId").value(placements.get(5).subjectId().toString()))
                .andExpect(jsonPath("$[0].publishedCount").value(10))
                .andExpect(jsonPath("$[2].topicId").value(placements.get(3).topicId().toString()));
        mvc.perform(put("/api/core/v1/me/recent-topics/" + UUID.randomUUID()).header("Authorization", p)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void anIneligibleRecentTopicIsOmitted() throws Exception {
        String p = player();
        var small = fixtures.placement("Subject", "Small");
        publish(small, 9);
        var big = fixtures.placement("Subject", "Big");
        publish(big, 10);
        mvc.perform(put("/api/core/v1/me/recent-topics/" + big.topicId()).header("Authorization", p)).andExpect(status().isNoContent());
        Thread.sleep(5);
        mvc.perform(put("/api/core/v1/me/recent-topics/" + small.topicId()).header("Authorization", p)).andExpect(status().isNoContent());
        mvc.perform(get("/api/core/v1/me/recent-topics").header("Authorization", p)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].topicId").value(big.topicId().toString()));
    }

    @Test
    void recentTopicPutIsRateLimitedPerPlayerWith429AndRetryAfter() throws Exception {
        String p = player();
        UUID topic = fixtures.placement("Subject", "Topic").topicId();
        for (int i = 0; i < 30; i++) {
            mvc.perform(put("/api/core/v1/me/recent-topics/" + topic).header("Authorization", p)).andExpect(status().isNoContent());
        }
        mvc.perform(put("/api/core/v1/me/recent-topics/" + topic).header("Authorization", p)).andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After")).andExpect(jsonPath("$.status").value(429));
        mvc.perform(put("/api/core/v1/me/recent-topics/" + topic).header("Authorization", player())).andExpect(status().isNoContent());
    }

    @Test
    void onlyTheKeralaPscCategoryCounts() throws Exception {
        var placement = fixtures.placement("Subject", "Other category");
        for (int i = 0; i < 10; i++) {
            fixtures.published(placement, in.minnal.core.question.domain.ContentCategory.SCHOOL_QUIZ,
                    in.minnal.core.question.domain.ExamLevel.TENTH, "S" + i);
        }
        topics(player()).andExpect(status().isOk()).andExpect(jsonPath("$.subjects.length()").value(0));
    }

    @Test
    void theLatestPublishedVersionDecidesTheTopicAndALaterDraftDoesNot() throws Exception {
        var a = fixtures.placement("Subject", "Topic A");
        var b = fixtures.placement("Subject", "Topic B");
        publish(a, 9);
        publish(b, 9);
        // Published v1 in A, then published v2 moved to B: counts toward B only.
        QuestionVersion moved = fixtures.published(a, "moved");
        var v2 = moved.nextDraft(fixtures.content(b, in.minnal.core.question.domain.ContentCategory.KERALA_PSC,
                in.minnal.core.question.domain.ExamLevel.TENTH, "moved v2"), Instant.now()).publish("Snobin", Instant.now());
        fixtures.insertVersion(v2);
        // Published v1 in A with a newer DRAFT v2 in B: still counts toward A.
        QuestionVersion kept = fixtures.published(a, "kept");
        fixtures.insertVersion(kept.nextDraft(fixtures.content(b, in.minnal.core.question.domain.ContentCategory.KERALA_PSC,
                in.minnal.core.question.domain.ExamLevel.TENTH, "kept v2"), Instant.now()));
        topics(player()).andExpect(status().isOk())
                .andExpect(jsonPath("$.subjects[0].topics.length()").value(2))
                .andExpect(jsonPath("$.subjects[0].topics[?(@.name=='Topic A')].publishedCount").value(10))
                .andExpect(jsonPath("$.subjects[0].topics[?(@.name=='Topic B')].publishedCount").value(10));
    }
}
