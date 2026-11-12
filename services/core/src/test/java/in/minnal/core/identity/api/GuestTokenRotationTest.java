package in.minnal.core.identity.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.SignedJWT;
import in.minnal.core.identity.infrastructure.TestKeys;
import java.security.KeyPair;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Matrix row "Rotation": a configured key plus one extra public key. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GuestTokenRotationTest {

    static final KeyPair ACTIVE = TestKeys.rsa(2048);
    static final KeyPair PREVIOUS = TestKeys.rsa(2048);

    @DynamicPropertySource
    static void keys(DynamicPropertyRegistry registry) {
        registry.add("minnal.jwt.signing-key", () -> TestKeys.privatePemBase64(ACTIVE));
        registry.add("minnal.jwt.key-id", () -> "2026-11");
        registry.add("minnal.jwt.extra-public-keys", () -> "2026-10=" + TestKeys.publicPemBase64(PREVIOUS));
    }

    @Autowired
    MockMvc mvc;

    @Test
    void theJwksListsBothKeysAndTokensUseTheActiveKid() throws Exception {
        JWKSet jwks = JWKSet.parse(mvc.perform(get("/api/core/v1/auth/jwks")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(jwks.getKeys()).extracting(JWK::getKeyID).containsExactly("2026-11", "2026-10");

        String json = mvc.perform(post("/api/core/v1/auth/guest").contentType(MediaType.APPLICATION_JSON).content("{\"lang\":\"en\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        SignedJWT jwt = SignedJWT.parse(JsonPath.<String>read(json, "$.accessToken"));
        assertThat(jwt.getHeader().getKeyID()).isEqualTo("2026-11");
        assertThat(jwt.verify(new RSASSAVerifier((RSAKey) jwks.getKeyByKeyId("2026-11")))).isTrue();
        assertThat(jwt.verify(new RSASSAVerifier((RSAKey) jwks.getKeyByKeyId("2026-10")))).isFalse();
    }
}
