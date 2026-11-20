package in.minnal.core.profile.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.contracts.events.UserDeletedEvent;
import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.GuestTokenService;
import in.minnal.core.identity.application.RefreshTokenService;
import in.minnal.core.identity.application.UserTokenService;
import in.minnal.core.profile.application.OutboxRepository;
import in.minnal.core.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Story 2.8 core side: logout and DELETE /me through the real MVC stack and Postgres. */
@TestPropertySource(properties = {"minnal.auth.web-url=http://localhost:5173"})
class AccountDeletionIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    UserTokenService userTokens;

    @Autowired
    GuestTokenService guestTokens;

    @Autowired
    RefreshTokenService refreshTokens;

    @MockitoSpyBean
    OutboxRepository outboxSpy;

    UUID user() {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', NULL, 'Anju', :t, :t)")
                .param("id", id).param("t", Timestamp.from(Instant.now())).update();
        jdbc.sql("INSERT INTO user_identity (provider, provider_subject, user_id, created_at) VALUES ('google', :s, :id, :t)")
                .param("s", id.toString()).param("id", id).param("t", Timestamp.from(Instant.now())).update();
        return id;
    }

    String bearer(UUID id) {
        return "Bearer " + userTokens.issue(new Account(id, null, "Anju"), "en").accessToken();
    }

    static MockHttpServletRequestBuilder guarded(MockHttpServletRequestBuilder request) {
        return request.header("Origin", "http://localhost:5173").header("X-Minnal-Auth", "1");
    }

    long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }

    @Test
    void logoutRevokesTheFamilyClearsTheCookieAndTheOldCookieThenGets401() throws Exception {
        UUID id = user();
        String raw = refreshTokens.issue(id);
        MockHttpServletResponse response = mvc.perform(guarded(post("/api/core/v1/auth/logout")).cookie(new Cookie("minnal_refresh", raw)))
                .andExpect(status().isNoContent()).andReturn().getResponse();
        assertThat(response.getHeader(HttpHeaders.SET_COOKIE)).startsWith("minnal_refresh=;").contains("Max-Age=0");
        assertThat(count("SELECT count(*) FROM refresh_token WHERE revoked_at IS NULL")).isZero();
        mvc.perform(guarded(post("/api/core/v1/auth/refresh")).contentType("application/json").content("{\"lang\":\"en\"}")
                .cookie(new Cookie("minnal_refresh", raw))).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutWithoutOrWithAnUnknownCookieIsStill204AndWithoutTheGuardIs403() throws Exception {
        mvc.perform(guarded(post("/api/core/v1/auth/logout"))).andExpect(status().isNoContent());
        mvc.perform(guarded(post("/api/core/v1/auth/logout")).cookie(new Cookie("minnal_refresh", "nope"))).andExpect(status().isNoContent());
        mvc.perform(post("/api/core/v1/auth/logout")).andExpect(status().isForbidden());
    }

    @Test
    void deleteMarksTheUserDeletedRevokesEveryTokenUnlinksTheIdentityAndWritesOneOutboxRow() throws Exception {
        UUID id = user();
        refreshTokens.issue(id);
        refreshTokens.issue(id);
        String bearer = bearer(id);
        mvc.perform(delete("/api/core/v1/me").header("Authorization", bearer)).andExpect(status().isNoContent());
        assertThat(jdbc.sql("SELECT status FROM app_user WHERE id = :id").param("id", id).query(String.class).single()).isEqualTo("DELETED");
        assertThat(count("SELECT count(*) FROM refresh_token WHERE revoked_at IS NULL")).isZero();
        assertThat(count("SELECT count(*) FROM user_identity")).isZero();
        List<Map<String, Object>> rows = jdbc.sql("SELECT stream, payload FROM event_outbox").query().listOfRows();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("stream")).isEqualTo(UserDeletedEvent.STREAM);
        assertThat(rows.get(0).get("payload").toString()).contains("\"userId\": \"" + id + "\"", "eventId", "occurredAt");
        // The same bearer is now signed out, and a second delete adds no second event.
        mvc.perform(delete("/api/core/v1/me").header("Authorization", bearer)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/core/v1/me/profile").header("Authorization", bearer)).andExpect(status().isUnauthorized());
        assertThat(count("SELECT count(*) FROM event_outbox")).isEqualTo(1);
    }

    @Test
    void deleteAlsoRemovesTheUsersRecentTopicsAndLeavesOthers() throws Exception {
        UUID id = user();
        UUID other = user();
        UUID subject = UUID.randomUUID();
        UUID topic = UUID.randomUUID();
        jdbc.sql("INSERT INTO subject (id, name, created_at) VALUES (:id, 'S', :t)").param("id", subject).param("t", Timestamp.from(Instant.now())).update();
        jdbc.sql("INSERT INTO topic (id, subject_id, name, created_at) VALUES (:id, :s, 'T', :t)").param("id", topic).param("s", subject).param("t", Timestamp.from(Instant.now())).update();
        for (UUID u : List.of(id, other)) {
            jdbc.sql("INSERT INTO recent_topic (user_id, topic_id, last_used_at) VALUES (:u, :t, :at)").param("u", u).param("t", topic).param("at", Timestamp.from(Instant.now())).update();
        }
        mvc.perform(delete("/api/core/v1/me").header("Authorization", bearer(id))).andExpect(status().isNoContent());
        assertThat(count("SELECT count(*) FROM recent_topic WHERE user_id = '" + id + "'")).isZero();
        assertThat(count("SELECT count(*) FROM recent_topic WHERE user_id = '" + other + "'")).isEqualTo(1);
    }

    @Test
    void aGuestTokenIs403AndNoTokenIs401() throws Exception {
        mvc.perform(delete("/api/core/v1/me").header("Authorization", "Bearer " + guestTokens.issue("en").accessToken()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/core/v1/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void aFailedOutboxWriteRollsTheWholeDeletionBack() throws Exception {
        UUID id = user();
        refreshTokens.issue(id);
        doThrow(new IllegalStateException("outbox down")).when(outboxSpy).add(anyString(), anyString(), any());
        try {
            mvc.perform(delete("/api/core/v1/me").header("Authorization", bearer(id)));
        } catch (Exception expected) {
            // surfaces as a 500 or a nested servlet exception; the state below is what matters
        }
        assertThat(jdbc.sql("SELECT status FROM app_user WHERE id = :id").param("id", id).query(String.class).single()).isEqualTo("ACTIVE");
        assertThat(count("SELECT count(*) FROM refresh_token WHERE revoked_at IS NULL")).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM user_identity")).isEqualTo(1);
    }
}
