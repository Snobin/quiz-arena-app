package in.minnal.core.question.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

class QuestionReportIntegrationTest extends PostgresIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserTokenService userTokens;
    @Autowired GuestTokenService guestTokens;
    @Autowired QuestionFixtures fixtures;

    UUID playerId;

    String player() {
        playerId = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', null, 'X', :t, :t)")
                .param("id", playerId).param("t", Timestamp.from(Instant.now())).update();
        return "Bearer " + userTokens.issue(new Account(playerId, null, "P"), "en").accessToken();
    }

    ResultActions send(String auth, UUID question, int version, String body) throws Exception {
        var request = post("/api/core/v1/questions/" + question + "/versions/" + version + "/reports")
                .contentType(MediaType.APPLICATION_JSON).content(body);
        if (auth != null) {
            request.header("Authorization", auth);
        }
        return mvc.perform(request);
    }

    static final String OK = "{\"surface\":\"RESULTS\",\"matchId\":\"m-1\",\"note\":\"  Answer is wrong  \"}";

    int reports() {
        return jdbc.sql("SELECT count(*) FROM question_report").query(Integer.class).single();
    }

    QuestionVersion published() {
        return fixtures.published(fixtures.placement("History", "Kerala"), "Q?");
    }

    @Test
    void registeredPlayerReportsAPublishedVersionAndItIsStoredOpenWithATrimmedNote() throws Exception {
        QuestionVersion v = published();
        String json = send(player(), v.questionId(), v.version(), OK).andExpect(status().isCreated())
                .andExpect(jsonPath("$.reportId").exists()).andReturn().getResponse().getContentAsString();
        assertThat(json).contains("reportId");
        assertThat(jdbc.sql("SELECT status || '|' || note || '|' || surface || '|' || match_id || '|' || reporter_id FROM question_report")
                .query(String.class).single()).isEqualTo("OPEN|Answer is wrong|RESULTS|m-1|" + playerId);
    }

    @Test
    void noteIsOptionalAndNfcNormalised() throws Exception {
        QuestionVersion v = published();
        send(player(), v.questionId(), v.version(), "{\"surface\":\"LIVE_REVEAL\"}").andExpect(status().isCreated());
        assertThat(jdbc.sql("SELECT note FROM question_report").query(String.class).optional()).isEmpty();
        String decomposed = "é"; // e + combining acute
        send(player(), v.questionId(), v.version(), "{\"surface\":\"RESULTS\",\"note\":\"" + decomposed + "\"}").andExpect(status().isCreated());
        assertThat(jdbc.sql("SELECT note FROM question_report WHERE note IS NOT NULL").query(String.class).single()).isEqualTo("é");
    }

    @Test
    void guestIs403AndNoTokenIs401AndNothingIsStored() throws Exception {
        QuestionVersion v = published();
        send("Bearer " + guestTokens.issue("en").accessToken(), v.questionId(), v.version(), OK)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
        send(null, v.questionId(), v.version(), OK).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.status").value(401));
        assertThat(reports()).isZero();
    }

    @Test
    void unknownDraftDiscardedAndCustomIdsAre404AndNothingIsStored() throws Exception {
        var placement = fixtures.placement("History", "Kerala");
        QuestionVersion draft = fixtures.draft(placement, "Draft?");
        QuestionVersion discarded = fixtures.discarded(placement, "Gone?");
        QuestionVersion live = published();
        String p = player();
        send(p, UUID.randomUUID(), 1, OK).andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404));
        send(p, live.questionId(), 99, OK).andExpect(status().isNotFound());
        send(p, draft.questionId(), draft.version(), OK).andExpect(status().isNotFound());
        send(p, discarded.questionId(), discarded.version(), OK).andExpect(status().isNotFound());
        assertThat(reports()).isZero();
    }

    @Test
    void aNoteOver500CharactersIs400WithAFieldErrorAnd500IsAccepted() throws Exception {
        QuestionVersion v = published();
        String p = player();
        send(p, v.questionId(), v.version(), "{\"surface\":\"RESULTS\",\"note\":\"" + "a".repeat(501) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("note"))
                .andExpect(jsonPath("$.type").value("urn:minnal:problem:bad-request"));
        send(p, v.questionId(), v.version(), "{\"surface\":\"NOPE\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("surface"));
        assertThat(reports()).isZero();
        send(p, v.questionId(), v.version(), "{\"surface\":\"RESULTS\",\"note\":\"" + "a".repeat(500) + "\"}").andExpect(status().isCreated());
    }

    @Test
    void aSecondOpenReportIs409ButAllowedOnceClosedAndOtherPlayersCanReport() throws Exception {
        QuestionVersion v = published();
        String p = player();
        UUID first = playerId;
        send(p, v.questionId(), v.version(), OK).andExpect(status().isCreated());
        send(p, v.questionId(), v.version(), OK).andExpect(status().isConflict()).andExpect(jsonPath("$.status").value(409));
        assertThat(reports()).isEqualTo(1);
        send(player(), v.questionId(), v.version(), OK).andExpect(status().isCreated());
        jdbc.sql("UPDATE question_report SET status = 'DISMISSED', resolved_at = now() WHERE reporter_id = :r").param("r", first).update();
        send(p, v.questionId(), v.version(), OK).andExpect(status().isCreated());
        assertThat(reports()).isEqualTo(3);
    }

    @Test
    void theSixthReportInTheWindowIs429WithRetryAfterAndStoresNothing() throws Exception {
        String p = player();
        for (int i = 0; i < 5; i++) {
            QuestionVersion v = published();
            send(p, v.questionId(), v.version(), OK).andExpect(status().isCreated());
        }
        QuestionVersion sixth = published();
        send(p, sixth.questionId(), sixth.version(), OK).andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After")).andExpect(jsonPath("$.status").value(429));
        assertThat(reports()).isEqualTo(5);
    }

    @Test
    void anOverlongMatchIdIs400WithAFieldError() throws Exception {
        QuestionVersion v = published();
        send(player(), v.questionId(), v.version(), "{\"surface\":\"RESULTS\",\"matchId\":\"" + "m".repeat(65) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("matchId"));
        assertThat(reports()).isZero();
    }

    @Test
    void anEmptyOrMalformedBodyIs400ProblemDetails() throws Exception {
        QuestionVersion v = published();
        String p = player();
        send(p, v.questionId(), v.version(), "").andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.type").value("urn:minnal:problem:bad-request"));
        send(p, v.questionId(), v.version(), "{").andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        assertThat(reports()).isZero();
    }

    @Test
    void aNonUuidQuestionIdOrNonIntegerVersionIs400ProblemDetails() throws Exception {
        QuestionVersion v = published();
        String p = player();
        mvc.perform(post("/api/core/v1/questions/not-a-uuid/versions/1/reports").contentType(MediaType.APPLICATION_JSON).content(OK)
                .header("Authorization", p)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        mvc.perform(post("/api/core/v1/questions/" + v.questionId() + "/versions/abc/reports").contentType(MediaType.APPLICATION_JSON).content(OK)
                .header("Authorization", p)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
        assertThat(reports()).isZero();
    }

    @Test
    void twoConcurrentReportsFromOnePlayerGiveOneCreatedAndOneConflict() throws Exception {
        QuestionVersion v = published();
        String p = player();
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        var gate = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.Callable<Integer> call = () -> {
            gate.await();
            return send(p, v.questionId(), v.version(), OK).andReturn().getResponse().getStatus();
        };
        var a = pool.submit(call);
        var b = pool.submit(call);
        gate.countDown();
        java.util.List<Integer> statuses = new java.util.ArrayList<>(java.util.List.of(a.get(), b.get()));
        pool.shutdown();
        java.util.Collections.sort(statuses);
        assertThat(statuses).containsExactly(201, 409);
        assertThat(reports()).isEqualTo(1);
    }
}
