package in.minnal.core.identity.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.SignedJWT;
import in.minnal.contracts.identity.MinnalClaims;
import in.minnal.core.identity.support.FakeGoogle;
import in.minnal.core.support.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Story 2.1 through the real MVC stack, a real Postgres and a fake OIDC provider: one test per row of
 * the I/O matrix. Real Google is never called.
 */
class GoogleSignInIntegrationTest extends PostgresIntegrationTest {

    static final FakeGoogle GOOGLE = new FakeGoogle();
    static final String WEB = "http://localhost:5173";

    @DynamicPropertySource
    static void google(DynamicPropertyRegistry registry) {
        registry.add("minnal.auth.google.client-id", () -> FakeGoogle.CLIENT_ID);
        registry.add("minnal.auth.google.client-secret", () -> FakeGoogle.CLIENT_SECRET);
        registry.add("minnal.auth.google.redirect-uri", () -> "https://api.minnal.test/api/core/v1/auth/google/callback");
        registry.add("minnal.auth.google.token-uri", GOOGLE::tokenUri);
        registry.add("minnal.auth.google.jwks-uri", GOOGLE::jwksUri);
        registry.add("minnal.auth.google.issuer", () -> FakeGoogle.ISSUER);
        registry.add("minnal.auth.web-url", () -> WEB);
        registry.add("minnal.auth.cookie-secure", () -> "true");
        registry.add("minnal.auth.admin-emails", () -> "Admin@Example.com, other@example.com");
        registry.add("minnal.cors.allowed-origins", () -> "https://minnal.test");
    }

    @AfterAll
    static void stop() throws Exception {
        GOOGLE.close();
    }

    @Autowired
    MockMvc mvc;

    /** A started sign-in: the authorization redirect's parameters and the state cookie. */
    record Started(MockHttpServletResponse response, URI location, Cookie cookie) {
        String param(String name) {
            return UriComponentsBuilder.fromUri(location).build().getQueryParams().getFirst(name);
        }
    }

    Started start(String returnTo) throws Exception {
        var request = get("/api/core/v1/auth/google/start");
        if (returnTo != null) {
            request.queryParam("returnTo", returnTo);
        }
        MockHttpServletResponse response = mvc.perform(request).andExpect(status().isFound()).andReturn().getResponse();
        return new Started(response, URI.create(response.getHeader(HttpHeaders.LOCATION)), response.getCookie("minnal_oidc"));
    }

    /** Starts a sign-in and prepares the fake provider to answer it with {@code claims} overrides. */
    Started startAndPrepare(String returnTo, Map<String, Object> claims) throws Exception {
        Started started = start(returnTo);
        GOOGLE.nextToken(started.param("code_challenge"), started.param("nonce"), claims);
        return started;
    }

    MockHttpServletResponse callback(Started started, String state, String code) throws Exception {
        var request = get("/api/core/v1/auth/google/callback");
        if (state != null) {
            request.queryParam("state", state);
        }
        if (code != null) {
            request.queryParam("code", code);
        }
        if (started != null) {
            request.cookie(started.cookie());
        }
        return mvc.perform(request).andExpect(status().isFound()).andReturn().getResponse();
    }

    long count(String table) {
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }

    /** A refresh request as the PWA sends it: its Origin and the custom guard header. */
    static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder guarded(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) {
        return request.header("Origin", WEB).header("X-Minnal-Auth", "1");
    }

    record Refreshed(SignedJWT jwt, String cookie) {
    }

    /** One refresh with {@code refreshCookie}: the new access token and the rotated cookie. */
    Refreshed rotate(String refreshCookie, String lang) throws Exception {
        var request = guarded(post("/api/core/v1/auth/refresh")).contentType("application/json")
                .content("{\"lang\":\"" + lang + "\"}").cookie(new Cookie("minnal_refresh", refreshCookie));
        MockHttpServletResponse response = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse();
        String token = com.jayway.jsonpath.JsonPath.read(response.getContentAsString(), "$.accessToken");
        return new Refreshed(SignedJWT.parse(token), refreshCookieValue(response));
    }

    SignedJWT refresh(String refreshCookie, String lang) throws Exception {
        return rotate(refreshCookie, lang).jwt();
    }

    MockHttpServletResponse refreshExpecting(String cookie, int expectedStatus) throws Exception {
        var request = guarded(post("/api/core/v1/auth/refresh")).contentType("application/json").content("{\"lang\":\"en\"}");
        if (cookie != null) {
            request.cookie(new Cookie("minnal_refresh", cookie));
        }
        return mvc.perform(request).andExpect(status().is(expectedStatus)).andReturn().getResponse();
    }

    static String refreshCookieValue(MockHttpServletResponse response) {
        return response.getHeaders(HttpHeaders.SET_COOKIE).stream()
                .filter(h -> h.startsWith("minnal_refresh=")).map(h -> h.substring("minnal_refresh=".length(), h.indexOf(';')))
                .findFirst().orElse(null);
    }

    @Test
    void startRedirectsToGoogleWithStateNonceAndPkceAndSetsAShortLivedLaxCookie() throws Exception {
        Started started = start("/me");

        assertThat(started.location().toString()).startsWith("https://accounts.google.com/o/oauth2/v2/auth");
        assertThat(started.param("client_id")).isEqualTo(FakeGoogle.CLIENT_ID);
        assertThat(started.param("response_type")).isEqualTo("code");
        assertThat(started.param("scope")).contains("openid");
        assertThat(started.param("code_challenge_method")).isEqualTo("S256");
        assertThat(started.param("state")).isNotBlank();
        assertThat(started.param("nonce")).isNotBlank();
        assertThat(started.param("code_challenge")).isNotBlank();
        String setCookie = started.response().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).startsWith("minnal_oidc=").contains("HttpOnly", "SameSite=Lax", "Max-Age=600", "Secure");
        // The verifier stays in the cookie only: it is not part of the redirect.
        assertThat(started.location().toString()).doesNotContain("code_verifier");
    }

    @Test
    void firstSignInCreatesTheAccountAndSetsTheRefreshCookieWithNoTokenInTheUrl() throws Exception {
        Started started = startAndPrepare("/me?tab=1", Map.of());

        MockHttpServletResponse done = callback(started, started.param("state"), "auth-code");

        String location = done.getHeader(HttpHeaders.LOCATION);
        assertThat(location).isEqualTo(WEB + "/auth/return?to=/me%3Ftab%3D1");
        String refreshHeader = done.getHeaders(HttpHeaders.SET_COOKIE).stream().filter(h -> h.startsWith("minnal_refresh=")).findFirst().orElseThrow();
        assertThat(refreshHeader).contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/api/core/v1/auth", "Max-Age=2592000");
        String raw = refreshCookieValue(done);
        assertThat(location).doesNotContain(raw);
        assertThat(count("app_user")).isEqualTo(1);
        assertThat(count("user_identity")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT status FROM app_user").query(String.class).single()).isEqualTo("ACTIVE");
        // Hash only: the raw token is nowhere in the table.
        assertThat(jdbc.sql("SELECT token_hash FROM refresh_token").query(String.class).single()).isNotEqualTo(raw).hasSize(64);
        assertThat(jdbc.sql("SELECT count(*) FROM refresh_token WHERE token_hash = :raw").param("raw", raw).query(Long.class).single()).isZero();
        // The one-time challenge cookie is cleared.
        assertThat(done.getHeaders(HttpHeaders.SET_COOKIE)).anyMatch(h -> h.startsWith("minnal_oidc=;") && h.contains("Max-Age=0"));

        SignedJWT jwt = refresh(raw, "ml");
        var claims = jwt.getJWTClaimsSet();
        UUID userId = jdbc.sql("SELECT id FROM app_user").query(UUID.class).single();
        assertThat(claims.getSubject()).isEqualTo(userId.toString());
        assertThat(claims.getStringListClaim(MinnalClaims.ROLES)).containsExactly("USER");
        assertThat(claims.getStringClaim(MinnalClaims.NAME)).isEqualTo("Anju");
        assertThat(claims.getStringClaim(MinnalClaims.LANG)).isEqualTo("ml");
        assertThat(claims.getIssuer()).isEqualTo(MinnalClaims.ISSUER);
        assertThat(Duration.between(claims.getIssueTime().toInstant(), claims.getExpirationTime().toInstant())).isEqualTo(Duration.ofHours(1));
        assertThat(jwt.getHeader().getKeyID()).isNotBlank();
        String jwks = mvc.perform(get("/api/core/v1/auth/jwks")).andReturn().getResponse().getContentAsString();
        RSAKey publicKey = (RSAKey) JWKSet.parse(jwks).getKeyByKeyId(jwt.getHeader().getKeyID());
        assertThat(jwt.verify(new RSASSAVerifier(publicKey))).isTrue();
    }

    @Test
    void returningUserResumesTheSameAccountWithoutADuplicate() throws Exception {
        Started first = startAndPrepare("/", Map.of());
        callback(first, first.param("state"), "c1");
        jdbc.sql("UPDATE app_user SET last_sign_in_at = :t").param("t", Timestamp.from(Instant.parse("2020-01-01T00:00:00Z"))).update();
        UUID id = jdbc.sql("SELECT id FROM app_user").query(UUID.class).single();

        Started second = startAndPrepare("/", Map.of());
        MockHttpServletResponse done = callback(second, second.param("state"), "c2");

        assertThat(done.getHeader(HttpHeaders.LOCATION)).startsWith(WEB + "/auth/return");
        assertThat(count("app_user")).isEqualTo(1);
        assertThat(count("user_identity")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT id FROM app_user").query(UUID.class).single()).isEqualTo(id);
        assertThat(jdbc.sql("SELECT last_sign_in_at > :t FROM app_user").param("t", Timestamp.from(Instant.parse("2021-01-01T00:00:00Z")))
                .query(Boolean.class).single()).isTrue();
    }

    @Test
    void anyBadIdTokenCreatesNoAccountAndRedirectsWithSigninFailed() throws Exception {
        Instant past = Instant.now().minusSeconds(3600);
        List<Map<String, Object>> badClaims = List.of(
                Map.of("aud", "someone-else"),
                Map.of("exp", Date.from(past)),
                Map.of("nonce", "not-the-nonce"),
                Map.of("iss", "https://evil.example"));
        for (Map<String, Object> claims : badClaims) {
            Started started = startAndPrepare("/ranks", claims);
            MockHttpServletResponse done = callback(started, started.param("state"), "auth-code");
            assertThat(done.getHeader(HttpHeaders.LOCATION)).as(claims.toString()).isEqualTo(WEB + "/ranks?signin=failed");
            assertThat(refreshCookieValue(done)).isNull();
        }
        Started badSignature = startAndPrepare("/ranks", Map.of());
        GOOGLE.signWithWrongKey();
        assertThat(callback(badSignature, badSignature.param("state"), "auth-code").getHeader(HttpHeaders.LOCATION))
                .isEqualTo(WEB + "/ranks?signin=failed");

        Started tokenEndpointDown = startAndPrepare("/ranks", Map.of());
        GOOGLE.failTokenEndpoint();
        assertThat(callback(tokenEndpointDown, tokenEndpointDown.param("state"), "auth-code").getHeader(HttpHeaders.LOCATION))
                .isEqualTo(WEB + "/ranks?signin=failed");

        assertThat(count("app_user")).isZero();
        assertThat(count("user_identity")).isZero();
        assertThat(count("refresh_token")).isZero();
    }

    @Test
    void badStateMissingCookieOrWrongPkceVerifierFailsWithoutAnAccount() throws Exception {
        Started started = startAndPrepare("/me", Map.of());
        assertThat(callback(started, "forged-state", "auth-code").getHeader(HttpHeaders.LOCATION)).isEqualTo(WEB + "/me?signin=failed");
        assertThat(callback(null, started.param("state"), "auth-code").getHeader(HttpHeaders.LOCATION)).isEqualTo(WEB + "/?signin=failed");
        assertThat(callback(started, started.param("state"), null).getHeader(HttpHeaders.LOCATION)).isEqualTo(WEB + "/me?signin=failed");

        // The fake provider enforces PKCE: a challenge that does not match the cookie's verifier is refused.
        GOOGLE.nextToken("a-different-challenge", started.param("nonce"), Map.of());
        assertThat(callback(started, started.param("state"), "auth-code").getHeader(HttpHeaders.LOCATION)).isEqualTo(WEB + "/me?signin=failed");

        assertThat(count("app_user")).isZero();
    }

    @Test
    void cancellingAtGoogleReturnsToTheSurfaceAsAGuest() throws Exception {
        Started started = start("/rooms");
        var request = get("/api/core/v1/auth/google/callback").queryParam("error", "access_denied")
                .queryParam("state", started.param("state")).cookie(started.cookie());
        MockHttpServletResponse done = mvc.perform(request).andExpect(status().isFound()).andReturn().getResponse();

        assertThat(done.getHeader(HttpHeaders.LOCATION)).isEqualTo(WEB + "/rooms?signin=cancelled");
        assertThat(refreshCookieValue(done)).isNull();
        assertThat(count("app_user")).isZero();
    }

    @Test
    void anOpenRedirectReturnToIsReplacedWithTheRoot() throws Exception {
        for (String evil : List.of("//evil.com", "https://evil.com/x", "/\\evil.com", "javascript:alert(1)", "evil", "/%0d%0aSet-Cookie:x=y")) {
            Started started = startAndPrepare(evil, Map.of());
            MockHttpServletResponse done = callback(started, started.param("state"), "auth-code");
            String location = done.getHeader(HttpHeaders.LOCATION);
            assertThat(location).as(evil).startsWith(WEB + "/");
            assertThat(location).as(evil).doesNotContain("evil.com");
            jdbc.sql("TRUNCATE refresh_token, user_identity, app_user").update();
            if (!evil.contains("%0d")) {
                assertThat(location).as(evil).isEqualTo(WEB + "/auth/return?to=/");
            }
        }
    }

    @Test
    void refreshWithAnUnknownExpiredOrMissingCookieIs401() throws Exception {
        mvc.perform(guarded(post("/api/core/v1/auth/refresh")).contentType("application/json").content("{\"lang\":\"en\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(guarded(post("/api/core/v1/auth/refresh")).contentType("application/json").content("{\"lang\":\"en\"}")
                .cookie(new Cookie("minnal_refresh", "never-issued"))).andExpect(status().isUnauthorized());

        Started started = startAndPrepare("/", Map.of());
        String raw = refreshCookieValue(callback(started, started.param("state"), "auth-code"));
        jdbc.sql("UPDATE refresh_token SET expires_at = now() - interval '1 second'").update();
        MockHttpServletResponse denied = mvc.perform(guarded(post("/api/core/v1/auth/refresh")).contentType("application/json")
                .content("{\"lang\":\"en\"}").cookie(new Cookie("minnal_refresh", raw))).andExpect(status().isUnauthorized())
                .andReturn().getResponse();
        // The dead cookie is cleared so the browser stops sending it.
        assertThat(denied.getHeader(HttpHeaders.SET_COOKIE)).contains("minnal_refresh=", "Max-Age=0", "Path=/api/core/v1/auth", "HttpOnly");
        assertThat(denied.getHeader(HttpHeaders.CACHE_CONTROL)).contains("no-store");
        assertThat(denied.getContentAsString()).contains("\"reason\":\"session_ended\"");
        // No cookie sent, none to clear.
        assertThat(mvc.perform(guarded(post("/api/core/v1/auth/refresh"))).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void refreshForADeletedAccountIs401AndAnUnsupportedLanguageIs400() throws Exception {
        Started started = startAndPrepare("/", Map.of());
        String raw = refreshCookieValue(callback(started, started.param("state"), "auth-code"));
        mvc.perform(guarded(post("/api/core/v1/auth/refresh")).contentType("application/json").content("{\"lang\":\"fr\"}")
                .cookie(new Cookie("minnal_refresh", raw))).andExpect(status().isBadRequest());
        // The 400 consumed nothing: the token is not rotated and the family is intact.
        assertThat(jdbc.sql("SELECT count(*) FROM refresh_token WHERE rotated_at IS NOT NULL OR revoked_at IS NOT NULL")
                .query(Long.class).single()).isZero();
        jdbc.sql("UPDATE app_user SET status = 'DELETED'").update();
        MockHttpServletResponse gone = refreshExpecting(raw, 401);
        assertThat(gone.getContentAsString()).contains("session_ended");
        assertThat(gone.getHeader(HttpHeaders.SET_COOKIE)).contains("Max-Age=0");
        // A deleted account is a plain rejection, not a reuse: nothing was revoked.
        assertThat(jdbc.sql("SELECT count(*) FROM refresh_token WHERE revoked_at IS NOT NULL").query(Long.class).single()).isZero();
    }

    @Test
    void aReturningSignInKeepsTheStoredNameWhenGoogleOmitsIt() throws Exception {
        Started first = startAndPrepare("/", Map.of());
        callback(first, first.param("state"), "c1");
        Map<String, Object> noName = new java.util.HashMap<>();
        noName.put("given_name", null);
        Started second = startAndPrepare("/", noName);
        String raw = refreshCookieValue(callback(second, second.param("state"), "c2"));
        assertThat(refresh(raw, "en").getJWTClaimsSet().getStringClaim(MinnalClaims.NAME)).isEqualTo("Anju");
    }

    @Test
    void aTokenWithoutExpOrWithAnotherAuthorizedPartyIsRejected() throws Exception {
        Map<String, Object> noExp = new java.util.HashMap<>();
        noExp.put("exp", null);
        Started a = startAndPrepare("/", noExp);
        assertThat(callback(a, a.param("state"), "c").getHeader(HttpHeaders.LOCATION)).isEqualTo(WEB + "/?signin=failed");
        Started b = startAndPrepare("/", Map.of("aud", List.of(FakeGoogle.CLIENT_ID, "other"), "azp", "other"));
        assertThat(callback(b, b.param("state"), "c").getHeader(HttpHeaders.LOCATION)).isEqualTo(WEB + "/?signin=failed");
        assertThat(count("app_user")).isZero();
    }

    @Test
    void adminIsGrantedOnlyForAVerifiedListedEmailAndRecomputedOnEveryRefresh() throws Exception {
        Started started = startAndPrepare("/", Map.of("email", "ADMIN@example.com"));
        String raw = refreshCookieValue(callback(started, started.param("state"), "auth-code"));

        Refreshed first = rotate(raw, "en");
        assertThat(first.jwt().getJWTClaimsSet().getStringListClaim(MinnalClaims.ROLES)).containsExactly("USER", "ADMIN");
        assertThat(rotate(first.cookie(), "en").jwt().getJWTClaimsSet().getStringListClaim(MinnalClaims.ROLES)).containsExactly("USER", "ADMIN");

        // The same address, unverified, is no admin: signing in again drops the stored email.
        Started unverified = startAndPrepare("/", Map.of("email", "admin@example.com", "email_verified", false));
        String raw2 = refreshCookieValue(callback(unverified, unverified.param("state"), "auth-code"));
        assertThat(refresh(raw2, "en").getJWTClaimsSet().getStringListClaim(MinnalClaims.ROLES)).containsExactly("USER");
        assertThat(count("app_user")).isEqualTo(1);
    }

    @Test
    void everyRefreshRotatesTheTokenWithinOneFamily() throws Exception {
        Started started = startAndPrepare("/", Map.of());
        String first = refreshCookieValue(callback(started, started.param("state"), "auth-code"));

        MockHttpServletResponse ok = mvc.perform(guarded(post("/api/core/v1/auth/refresh")).contentType("application/json")
                .content("{\"lang\":\"en\"}").cookie(new Cookie("minnal_refresh", first))).andExpect(status().isOk()).andReturn().getResponse();
        String second = refreshCookieValue(ok);

        assertThat(second).isNotBlank().isNotEqualTo(first);
        assertThat(ok.getHeaders(HttpHeaders.SET_COOKIE).get(0)).contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/api/core/v1/auth", "Max-Age=2592000");
        assertThat(count("refresh_token")).isEqualTo(2);
        assertThat(jdbc.sql("SELECT count(DISTINCT family_id) FROM refresh_token").query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM refresh_token WHERE rotated_at IS NOT NULL").query(Long.class).single()).isEqualTo(1);
        // The sign-in's token started its own family; a second sign-in starts another.
        Started again = startAndPrepare("/", Map.of());
        callback(again, again.param("state"), "c2");
        assertThat(jdbc.sql("SELECT count(DISTINCT family_id) FROM refresh_token").query(Long.class).single()).isEqualTo(2);
    }

    @Test
    void replayingARotatedTokenRevokesTheWholeFamilyAndClearsTheCookie() throws Exception {
        Started started = startAndPrepare("/", Map.of());
        String stolen = refreshCookieValue(callback(started, started.param("state"), "auth-code"));
        Refreshed legit = rotate(stolen, "en");
        UUID userId = jdbc.sql("SELECT id FROM app_user").query(UUID.class).single();

        MockHttpServletResponse reuse = refreshExpecting(stolen, 401);

        assertThat(reuse.getContentAsString()).contains("\"reason\":\"session_ended\"");
        assertThat(reuse.getHeader(HttpHeaders.SET_COOKIE)).contains("minnal_refresh=", "Max-Age=0");
        assertThat(jdbc.sql("SELECT count(*) FROM refresh_token WHERE revoked_at IS NULL").query(Long.class).single()).isZero();
        // The legitimate player's current token died with the family.
        assertThat(refreshExpecting(legit.cookie(), 401).getContentAsString()).contains("session_ended");
        assertThat(userId).isNotNull();
    }

    @Test
    void aRefreshWithoutTheGuardIs403AndRotatesNothing() throws Exception {
        Started started = startAndPrepare("/", Map.of());
        String raw = refreshCookieValue(callback(started, started.param("state"), "auth-code"));
        Cookie cookie = new Cookie("minnal_refresh", raw);
        var json = "{\"lang\":\"en\"}";

        mvc.perform(post("/api/core/v1/auth/refresh").contentType("application/json").content(json).cookie(cookie)
                .header("Origin", WEB)).andExpect(status().isForbidden());
        mvc.perform(post("/api/core/v1/auth/refresh").contentType("application/json").content(json).cookie(cookie)
                .header("X-Minnal-Auth", "1")).andExpect(status().isForbidden());
        mvc.perform(post("/api/core/v1/auth/refresh").contentType("application/json").content(json).cookie(cookie)
                .header("Origin", "https://evil.example").header("X-Minnal-Auth", "1")).andExpect(status().isForbidden());
        mvc.perform(post("/api/core/v1/auth/refresh").contentType("application/json").content(json).cookie(cookie)
                .header("Origin", WEB).header("X-Minnal-Auth", "0")).andExpect(status().isForbidden());

        assertThat(count("refresh_token")).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM refresh_token WHERE rotated_at IS NOT NULL").query(Long.class).single()).isZero();
        refresh(raw, "en"); // still valid after the refused attempts
    }

    @Test
    void twoConcurrentRefreshesOfOneTokenNeverBothSucceed() throws Exception {
        Started started = startAndPrepare("/", Map.of());
        String raw = refreshCookieValue(callback(started, started.param("state"), "auth-code"));
        var pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        var go = new java.util.concurrent.CountDownLatch(1);
        List<java.util.concurrent.Future<Integer>> results = List.of(
                pool.submit(() -> { go.await(); return refreshStatus(raw); }),
                pool.submit(() -> { go.await(); return refreshStatus(raw); }));
        go.countDown();
        List<Integer> statuses = List.of(results.get(0).get(), results.get(1).get());
        pool.shutdown();

        assertThat(statuses).containsExactlyInAnyOrder(200, 401);
    }

    int refreshStatus(String cookie) throws Exception {
        return mvc.perform(guarded(post("/api/core/v1/auth/refresh")).contentType("application/json").content("{\"lang\":\"en\"}")
                .cookie(new Cookie("minnal_refresh", cookie))).andReturn().getResponse().getStatus();
    }

    @Test
    void nameFallsBackToPlayerWithoutAGivenName() throws Exception {
        Map<String, Object> claims = new java.util.HashMap<>();
        claims.put("given_name", null);
        Started started = startAndPrepare("/", claims);
        String raw = refreshCookieValue(callback(started, started.param("state"), "auth-code"));

        assertThat(refresh(raw, "en").getJWTClaimsSet().getStringClaim(MinnalClaims.NAME)).isEqualTo("Player");
    }

    @Test
    void refreshAllowsCredentialsOnlyForThePwaOrigin() throws Exception {
        var allowed = options("/api/core/v1/auth/refresh").header("Origin", WEB)
                .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "content-type,x-minnal-auth");
        MockHttpServletResponse ok = mvc.perform(allowed).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(ok.getHeader("Access-Control-Allow-Origin")).isEqualTo(WEB);
        assertThat(ok.getHeader("Access-Control-Allow-Credentials")).isEqualTo("true");

        var evil = options("/api/core/v1/auth/refresh").header("Origin", "https://evil.example")
                .header("Access-Control-Request-Method", "POST");
        mvc.perform(evil).andExpect(status().isForbidden());
    }
}
