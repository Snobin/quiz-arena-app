package in.minnal.game.platform.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Date;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The real JwtDecoder against a JWKS served over HTTP: valid, tampered, forged, expired, missing
 * and wrong-issuer tokens on a protected test endpoint; health and /ws stay public.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ResourceServerTest {

    static final String WHOAMI = "/api/game/v1/test/whoami";
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

    ResultActions whoami(String token) throws Exception {
        var request = get(WHOAMI).header("X-Request-Id", "rs-test-1");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return mvc.perform(request);
    }

    void assert401(ResultActions result, String detail) throws Exception {
        result.andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.title").value("Unauthorized"))
                .andExpect(jsonPath("$.detail").value(detail))
                .andExpect(jsonPath("$.instance").value(WHOAMI))
                .andExpect(header().string("X-Request-Id", "rs-test-1"))
                .andExpect(header().exists("WWW-Authenticate"));
    }

    @Test
    void aValidTokenPassesWithTheMinnalPrincipal() throws Exception {
        String token = JWKS.token(c -> c.subject("guest-sub-1").claim("lang", "en").claim("name", "Guest 1234"));
        whoami(token)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sub").value("guest-sub-1"))
                .andExpect(jsonPath("$.roles[0]").value("GUEST"))
                .andExpect(jsonPath("$.roles.length()").value(1))
                .andExpect(jsonPath("$.name").value("Guest 1234"))
                .andExpect(jsonPath("$.lang").value("en"));
    }

    @Test
    void aMissingTokenIs401() throws Exception {
        assert401(whoami(null), "missing bearer token");
    }

    @Test
    void aTamperedForgedOrGarbageTokenIs401() throws Exception {
        for (String token : List.of(JWKS.tamperedToken(), JWKS.forgedToken(), "not.a.jwt", "garbage")) {
            assert401(whoami(token), "invalid or expired bearer token");
        }
    }

    @Test
    void anExpiredTokenIs401() throws Exception {
        assert401(whoami(JWKS.expiredToken()), "invalid or expired bearer token");
    }

    @Test
    void aWrongIssuerMissingExpOrMissingSubIs401() throws Exception {
        assert401(whoami(JWKS.token(c -> c.issuer("someone-else"))), "invalid or expired bearer token");
        assert401(whoami(JWKS.token(c -> c.expirationTime((Date) null))), "invalid or expired bearer token");
        assert401(whoami(JWKS.token(c -> c.subject(null))), "invalid or expired bearer token");
    }

    @Test
    void aNonBearerAuthorizationHeaderCountsAsMissing() throws Exception {
        var result = mvc.perform(get(WHOAMI).header("Authorization", "Basic dXNlcjpwYXNz"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("missing bearer token"))
                .andReturn();
        assertThat(result.getResponse().getHeader("WWW-Authenticate")).isEqualTo("Bearer");
        whoami("x").andExpect(header().string("WWW-Authenticate", "Bearer error=\"invalid_token\""));
    }

    @Test
    void aNewKidTriggersOneJwksRefetch() throws Exception {
        whoami(JWKS.validToken()).andExpect(status().isOk());
        int before = JWKS.fetches();
        assertThat(before).isGreaterThanOrEqualTo(1);
        // Known kid: served from the cache.
        whoami(JWKS.validToken()).andExpect(status().isOk());
        assertThat(JWKS.fetches()).isEqualTo(before);

        String oldKid = JWKS.keyId();
        JWKS.rotate();
        assertThat(JWKS.keyId()).isNotEqualTo(oldKid);
        whoami(JWKS.validToken()).andExpect(status().isOk());
        assertThat(JWKS.fetches()).isEqualTo(before + 1);
    }

    @Test
    void healthAndWsArePublic() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        // A plain GET is not an upgrade, so the handshake handler refuses it, but never with 401.
        assertThat(mvc.perform(get("/ws")).andReturn().getResponse().getStatus()).isNotIn(401, 403);
    }

    @Test
    void sessionsAreNeverCreated() throws Exception {
        var result = whoami(JWKS.validToken()).andExpect(status().isOk()).andReturn();
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getHeader("Set-Cookie")).isNull();
    }

    @Test
    void theRolesClaimMapsToRoleAuthorities() {
        var jwt = org.springframework.security.oauth2.jwt.Jwt.withTokenValue("t").header("alg", "RS256")
                .subject("s").claim("roles", List.of("USER", "ADMIN", "BOGUS")).claim("name", "n").claim("lang", "ml").build();
        var authentication = new MinnalJwtAuthenticationConverter().convert(jwt);
        assertThat(authentication.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_USER", "ROLE_ADMIN");
        assertThat(authentication.getName()).isEqualTo("s");
        assertThat(authentication.getPrincipal()).isEqualTo(new MinnalPrincipal("s",
                java.util.Set.of(in.minnal.contracts.identity.Role.USER, in.minnal.contracts.identity.Role.ADMIN), "n", "ml"));
    }

    @Test
    void theProfileCompleteClaimIsReadAndAnAbsentOrNonBooleanClaimCountsAsIncomplete() {
        var base = org.springframework.security.oauth2.jwt.Jwt.withTokenValue("t").header("alg", "RS256").subject("s")
                .claim("roles", List.of("USER"));
        assertThat(MinnalPrincipal.from(base.claim("profileComplete", true).build()).profileComplete()).isTrue();
        assertThat(MinnalPrincipal.from(base.claim("profileComplete", false).build()).profileComplete()).isFalse();
        assertThat(MinnalPrincipal.from(base.claim("profileComplete", "true").build()).profileComplete()).isFalse();
        var old = org.springframework.security.oauth2.jwt.Jwt.withTokenValue("t").header("alg", "RS256").subject("s")
                .claim("roles", List.of("USER")).build();
        assertThat(MinnalPrincipal.from(old).profileComplete()).isFalse();
    }
}
