package in.minnal.ratings.rating.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jwt.JWTClaimsSet;
import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MatchMode;
import in.minnal.ratings.ingest.MatchCompletedHandler;
import in.minnal.ratings.platform.infrastructure.security.TestJwks;
import in.minnal.ratings.support.PostgresIntegrationTest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@AutoConfigureMockMvc
class RatingsApiIntegrationTest extends PostgresIntegrationTest {

    static final TestJwks JWKS = TestJwks.start();

    @DynamicPropertySource
    static void jwks(DynamicPropertyRegistry registry) {
        registry.add("minnal.security.jwks-uri", JWKS::uri);
    }

    @AfterAll
    static void stop() {
        JWKS.close();
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    MatchCompletedHandler handler;

    String userToken(UUID user, String role) {
        return "Bearer " + JWKS.token(c -> c.subject(user.toString()).claim("roles", List.of(role)));
    }

    ResultActions getAs(UUID user, String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", userToken(user, "USER")));
    }

    MatchCompletedEvent play(UUID match, Instant endedAt, QuestionSource source, List<CompletedParticipant> participants) {
        return MatchCompletedEvent.of(match, MatchMode.QUICK, null, source, endedAt.minusSeconds(180), endedAt, null, participants);
    }

    @Test
    void aRatedMatchReturnsTheCallersBeforeAfterAndDelta() throws Exception {
        UUID anju = UUID.randomUUID();
        UUID vishnu = UUID.randomUUID();
        UUID match = UUID.randomUUID();
        handler.handle(rated(match, List.of(user(anju, 7000, 1), user(vishnu, 4000, 2))));

        getAs(anju, "/api/ratings/v1/matches/" + match).andExpect(status().isOk())
                .andExpect(jsonPath("$.matchId").value(match.toString())).andExpect(jsonPath("$.mode").value("QUICK"))
                .andExpect(jsonPath("$.rated").value(true)).andExpect(jsonPath("$.ratingBefore").value(1200))
                .andExpect(jsonPath("$.ratingAfter").value(1216)).andExpect(jsonPath("$.delta").value(16));
        // Her own data only: the opponent sees hers, never Anju's.
        getAs(vishnu, "/api/ratings/v1/matches/" + match).andExpect(jsonPath("$.delta").value(-16));
    }

    @Test
    void anUnratedMatchHasRatedFalseAndNoRatingFields() throws Exception {
        UUID anju = UUID.randomUUID();
        UUID match = UUID.randomUUID();
        handler.handle(event(match, QuestionSource.CUSTOM, List.of(user(anju, 7000, 1), guest(100, 2))));

        getAs(anju, "/api/ratings/v1/matches/" + match).andExpect(status().isOk()).andExpect(jsonPath("$.rated").value(false))
                .andExpect(jsonPath("$.ratingBefore").doesNotExist()).andExpect(jsonPath("$.ratingAfter").doesNotExist())
                .andExpect(jsonPath("$.delta").doesNotExist());
    }

    @Test
    void aMatchNotProcessedYetOrNotTheCallersIs404ProblemDetails() throws Exception {
        UUID anju = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        UUID match = UUID.randomUUID();
        getAs(anju, "/api/ratings/v1/matches/" + match).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404)).andExpect(jsonPath("$.detail").isNotEmpty());
        handler.handle(rated(match, List.of(user(anju, 7000, 1), guest(100, 2))));
        getAs(stranger, "/api/ratings/v1/matches/" + match).andExpect(status().isNotFound());
    }

    @Test
    void aGuestTokenIs403AndNoOrABadTokenIs401AndABadMatchIdIs400() throws Exception {
        UUID match = UUID.randomUUID();
        for (String path : List.of("/api/ratings/v1/matches/" + match, "/api/ratings/v1/me/ratings", "/api/ratings/v1/me/matches")) {
            mvc.perform(get(path).header("Authorization", "Bearer " + JWKS.validToken())).andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.status").value(403));
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        getAs(UUID.randomUUID(), "/api/ratings/v1/matches/not-a-uuid").andExpect(status().isBadRequest());
    }

    @Test
    void anAdminTokenIsAllowed() throws Exception {
        UUID admin = UUID.randomUUID();
        mvc.perform(get("/api/ratings/v1/me/ratings").header("Authorization", userToken(admin, "ADMIN"))).andExpect(status().isOk());
    }

    @Test
    void aFreshPlayerHasAll1200AndARatedOneShowsHerQuickRating() throws Exception {
        UUID anju = UUID.randomUUID();
        getAs(anju, "/api/ratings/v1/me/ratings").andExpect(status().isOk()).andExpect(jsonPath("$.ratings.length()").value(3))
                .andExpect(jsonPath("$.ratings[0].mode").value("QUICK")).andExpect(jsonPath("$.ratings[0].rating").value(1200))
                .andExpect(jsonPath("$.ratings[1].mode").value("TOPIC_DUEL")).andExpect(jsonPath("$.ratings[1].rating").value(1200))
                .andExpect(jsonPath("$.ratings[2].mode").value("BATTLE_ROOM")).andExpect(jsonPath("$.ratings[2].rating").value(1200));

        handler.handle(rated(UUID.randomUUID(), List.of(user(anju, 7000, 1), guest(100, 2))));

        getAs(anju, "/api/ratings/v1/me/ratings").andExpect(jsonPath("$.ratings[0].rating").value(1216))
                .andExpect(jsonPath("$.ratings[1].rating").value(1200));
    }

    @Test
    void historyIsTheCallersOwnNewestFirstCappedAt20WithNullDeltaForUnrated() throws Exception {
        UUID anju = UUID.randomUUID();
        Instant base = Instant.parse("2026-11-19T10:00:00Z");
        for (int i = 0; i < 25; i++) {
            handler.handle(play(UUID.randomUUID(), base.plusSeconds(60L * i), i % 5 == 0 ? QuestionSource.CUSTOM : QuestionSource.BANK,
                    List.of(user(anju, 1000 + i, 1), guest(10, 2))));
        }
        handler.handle(rated(UUID.randomUUID(), List.of(user(UUID.randomUUID(), 5, 1), guest(1, 2)))); // someone else's match

        getAs(anju, "/api/ratings/v1/me/matches").andExpect(status().isOk()).andExpect(jsonPath("$.matches.length()").value(20))
                .andExpect(jsonPath("$.matches[0].score").value(1024)) // the newest (i = 24)
                .andExpect(jsonPath("$.matches[19].score").value(1005)) // i = 5
                .andExpect(jsonPath("$.matches[0].result").value("WIN")).andExpect(jsonPath("$.matches[0].mode").value("QUICK"))
                .andExpect(jsonPath("$.matches[0].placement").value(1)).andExpect(jsonPath("$.matches[0].rated").value(true))
                .andExpect(jsonPath("$.matches[0].ratingDelta").exists()).andExpect(jsonPath("$.matches[0].endedAt").exists());
        getAs(anju, "/api/ratings/v1/me/matches?limit=5").andExpect(jsonPath("$.matches.length()").value(5));
        // i = 20 was an unrated (CUSTOM) match: no delta field at all.
        getAs(anju, "/api/ratings/v1/me/matches").andExpect(jsonPath("$.matches[4].score").value(1020))
                .andExpect(jsonPath("$.matches[4].rated").value(false)).andExpect(jsonPath("$.matches[4].ratingDelta").doesNotExist());
    }

    @Test
    void aBadLimitIs400() throws Exception {
        UUID anju = UUID.randomUUID();
        for (String limit : List.of("0", "21", "-1", "abc")) {
            getAs(anju, "/api/ratings/v1/me/matches?limit=" + limit).andExpect(status().isBadRequest());
        }
    }

    @Test
    void limit20IsAllowedResponsesAreNotCachedAndARatedRecordWithoutItsEventIs404() throws Exception {
        UUID anju = UUID.randomUUID();
        getAs(anju, "/api/ratings/v1/me/matches?limit=20").andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
        UUID match = UUID.randomUUID();
        jdbc.sql("INSERT INTO match_record (match_id, user_id, mode, placement, result, score, correct_count, forfeited, rated, rating_delta, ended_at) VALUES (:m, :u, 'QUICK', 1, 'WIN', 10, 1, false, true, 16, now())")
                .param("m", match).param("u", anju).update();
        getAs(anju, "/api/ratings/v1/matches/" + match).andExpect(status().isNotFound());
    }
}
