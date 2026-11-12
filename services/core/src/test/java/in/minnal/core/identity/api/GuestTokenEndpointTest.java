package in.minnal.core.identity.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import in.minnal.contracts.identity.MinnalClaims;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Guest token and JWKS through the real MVC stack (no Docker: the {@code test} profile). The issued
 * JWT is verified with Nimbus against the JWKS the endpoint serves, exactly as a resource server would.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GuestTokenEndpointTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    ApplicationContext context;

    ResultActions requestGuest(String body) throws Exception {
        return mvc.perform(post("/api/core/v1/auth/guest").contentType(MediaType.APPLICATION_JSON).content(body));
    }

    JWKSet servedJwks() throws Exception {
        String json = mvc.perform(get("/api/core/v1/auth/jwks"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andReturn().getResponse().getContentAsString();
        return JWKSet.parse(json);
    }

    @Test
    void issuesAGuestJwtThatVerifiesAgainstTheServedJwks() throws Exception {
        String json = requestGuest("{\"lang\":\"ml\"}")
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(json, "$.accessToken");
        Instant expiresAt = Instant.parse(JsonPath.read(json, "$.expiresAt"));

        SignedJWT jwt = SignedJWT.parse(token);
        assertThat(jwt.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.RS256);
        String kid = jwt.getHeader().getKeyID();
        assertThat(kid).isNotBlank();
        RSAKey key = (RSAKey) servedJwks().getKeyByKeyId(kid);
        assertThat(key).as("JWKS has the token's kid").isNotNull();
        assertThat(jwt.verify(new RSASSAVerifier(key))).isTrue();

        JWTClaimsSet claims = jwt.getJWTClaimsSet();
        assertThat(claims.getIssuer()).isEqualTo(MinnalClaims.ISSUER).isEqualTo("minnal-core");
        assertThat(UUID.fromString(claims.getSubject())).isNotNull();
        assertThat(claims.getStringListClaim(MinnalClaims.ROLES)).containsExactly("GUEST");
        assertThat(claims.getStringClaim(MinnalClaims.NAME)).matches("Guest [1-9][0-9]{3}");
        assertThat(claims.getStringClaim(MinnalClaims.LANG)).isEqualTo("ml");
        Instant iat = claims.getIssueTime().toInstant();
        Instant exp = claims.getExpirationTime().toInstant();
        assertThat(Duration.between(iat, exp)).isEqualTo(Duration.ofHours(24));
        assertThat(exp).isEqualTo(expiresAt);
        assertThat(iat).isBetween(Instant.now().minusSeconds(60), Instant.now().plusSeconds(1));
        assertThat(claims.getClaims()).containsOnlyKeys("iss", "sub", "iat", "exp", "roles", "name", "lang");
    }

    @Test
    void englishGuestsGetLangEnAndEveryGuestAFreshSub() throws Exception {
        Set<String> subs = new HashSet<>();
        for (int i = 0; i < 5; i++) {
            String json = requestGuest("{\"lang\":\"en\"}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            JWTClaimsSet claims = SignedJWT.parse(JsonPath.<String>read(json, "$.accessToken")).getJWTClaimsSet();
            assertThat(claims.getStringClaim(MinnalClaims.LANG)).isEqualTo("en");
            assertThat(claims.getStringClaim(MinnalClaims.NAME)).matches("Guest [1-9][0-9]{3}");
            subs.add(claims.getSubject());
        }
        assertThat(subs).hasSize(5);
    }

    @Test
    void anUnsupportedOrMissingLangIs400ProblemDetail() throws Exception {
        for (String body : List.of("{\"lang\":\"fr\"}", "{}", "{\"lang\":null}", "{\"lang\":\"EN\"}", "{\"lang\":\"ml-IN\"}",
                "{\"lang\":7}", "not json", "")) {
            requestGuest(body)
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(400))
                    .andExpect(jsonPath("$.instance").value("/api/core/v1/auth/guest"));
        }
    }

    @Test
    void theJwksHasOnlyPublicMembers() throws Exception {
        String json = mvc.perform(get("/api/core/v1/auth/jwks")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> keys = JsonPath.read(json, "$.keys");
        assertThat(keys).hasSize(1);
        assertThat(keys.getFirst()).containsOnlyKeys("kty", "kid", "use", "alg", "n", "e")
                .containsEntry("kty", "RSA").containsEntry("use", "sig").containsEntry("alg", "RS256");
        assertThat(json).doesNotContain("\"d\"", "\"p\"", "\"q\"", "\"dp\"", "\"dq\"", "\"qi\"");
    }

    @Test
    void noSecurityFilterChainGuardsCore() throws Exception {
        // Only the JOSE library is on the classpath, so the existing endpoints stay exactly as they were.
        assertThat(context.containsBean("springSecurityFilterChain")).isFalse();
        // The test profile has no database, so health may be DOWN (503); it is never 401/403.
        assertThat(mvc.perform(get("/actuator/health")).andReturn().getResponse().getStatus()).isNotIn(401, 403);
        mvc.perform(get("/api/core/v1/nope")).andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
    }
}
