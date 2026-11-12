package in.minnal.core.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.RSAKey;
import java.security.KeyPair;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class JwtSigningKeysTest {

    static final KeyPair ACTIVE = TestKeys.rsa(2048);
    static final KeyPair PREVIOUS = TestKeys.rsa(2048);

    static MockEnvironment profiles(String... profiles) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profiles);
        return environment;
    }

    @Test
    void prodWithoutAKeyFailsWithAClearMessage() {
        for (String blank : new String[] {null, "", "  "}) {
            assertThatThrownBy(() -> JwtSigningKeys.load(blank, "", "", profiles("prod")))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("MINNAL_JWT_SIGNING_KEY")
                    .hasMessageContaining("openssl genpkey");
        }
        // prod wins even next to a profile that would allow an ephemeral key.
        assertThatThrownBy(() -> JwtSigningKeys.load("", "", "", profiles("local", "prod")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aProfileOutsideLocalTestItFailsToo() {
        assertThatThrownBy(() -> JwtSigningKeys.load("", "", "", profiles("staging")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void localTestAndItGetAnEphemeral2048BitKey() {
        for (String profile : List.of("local", "test", "it")) {
            JwtSigningKeys keys = JwtSigningKeys.load("", "", "", profiles(profile));
            assertThat(keys.activeKeyId()).startsWith("ephemeral-");
            assertThat(keys.signingKey().isPrivate()).isTrue();
            assertThat(keys.signingKey().size()).isEqualTo(2048);
            assertThat(keys.publicJwkSet().getKeys()).hasSize(1);
        }
    }

    @Test
    void anEphemeralKeyIgnoresTheConfiguredKidAndIsFreshEachTime() {
        JwtSigningKeys first = JwtSigningKeys.load("", "2026-11", "", profiles("local"));
        JwtSigningKeys second = JwtSigningKeys.load("", "2026-11", "", profiles("local"));
        assertThat(first.activeKeyId()).startsWith("ephemeral-").isNotEqualTo("2026-11");
        assertThat(second.activeKeyId()).startsWith("ephemeral-").isNotEqualTo(first.activeKeyId());
    }

    @Test
    void loadsTheConfiguredKeyWithItsKid() throws Exception {
        JwtSigningKeys keys = JwtSigningKeys.load(TestKeys.privatePemBase64(ACTIVE), "2026-11", "", profiles("prod"));
        assertThat(keys.activeKeyId()).isEqualTo("2026-11");
        assertThat(keys.signingKey().toRSAPublicKey().getModulus())
                .isEqualTo(((RSAPublicKey) ACTIVE.getPublic()).getModulus());
    }

    @Test
    void aBlankKidIsTheKeyThumbprint() throws Exception {
        JwtSigningKeys keys = JwtSigningKeys.load(TestKeys.privatePemBase64(ACTIVE), " ", "", profiles("prod"));
        assertThat(keys.activeKeyId()).isEqualTo(keys.signingKey().computeThumbprint().toString());
    }

    @Test
    void extraPublicKeysArePublishedButNeverSign() {
        String extra = "2026-10=" + TestKeys.publicPemBase64(PREVIOUS);
        JwtSigningKeys keys = JwtSigningKeys.load(TestKeys.privatePemBase64(ACTIVE), "2026-11", extra, profiles("prod"));
        assertThat(keys.publicJwkSet().getKeys()).extracting(JWK::getKeyID).containsExactly("2026-11", "2026-10");
        assertThat(keys.publicJwkSet().getKeys()).allSatisfy(key -> assertThat(key.isPrivate()).isFalse());
        assertThat(keys.signingKey().getKeyID()).isEqualTo("2026-11");
    }

    @Test
    void theJsonHasOnlyPublicMembers() {
        String extra = "old=" + TestKeys.publicPemBase64(PREVIOUS);
        JwtSigningKeys keys = JwtSigningKeys.load(TestKeys.privatePemBase64(ACTIVE), "new", extra, profiles("prod"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> jwks = (List<Map<String, Object>>) keys.publicJwkSetJson().get("keys");
        assertThat(jwks).hasSize(2).allSatisfy(jwk -> {
            assertThat(jwk).containsOnlyKeys("kty", "kid", "use", "alg", "n", "e");
            assertThat(jwk).containsEntry("kty", "RSA").containsEntry("use", "sig").containsEntry("alg", "RS256");
        });
    }

    @Test
    void rejectsDuplicateKids() {
        String extra = "same=" + TestKeys.publicPemBase64(PREVIOUS);
        assertThatThrownBy(() -> JwtSigningKeys.load(TestKeys.privatePemBase64(ACTIVE), "same", extra, profiles("prod")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("same");
    }

    @Test
    void rejectsBrokenKeys() {
        String notBase64 = "%%%";
        String publicAsPrivate = TestKeys.publicPemBase64(ACTIVE);
        String weak = TestKeys.privatePemBase64(TestKeys.rsa(1024));
        String garbage = TestKeys.base64Pem("PRIVATE KEY", new byte[] {1, 2, 3});
        String plainPem = Base64.getEncoder().encodeToString("no pem here".getBytes());
        for (String bad : List.of(notBase64, publicAsPrivate, weak, garbage, plainPem)) {
            assertThatThrownBy(() -> JwtSigningKeys.load(bad, "k", "", profiles("prod")))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("MINNAL_JWT_SIGNING_KEY")
                    .hasMessageNotContaining(bad);
        }
        assertThatThrownBy(() -> JwtSigningKeys.load(weak, "k", "", profiles("prod"))).hasMessageContaining("2048");
    }

    @Test
    void rejectsMalformedExtraKeys() {
        String active = TestKeys.privatePemBase64(ACTIVE);
        for (String bad : List.of("no-equals-sign", "=" + TestKeys.publicPemBase64(PREVIOUS), "old=" + TestKeys.privatePemBase64(PREVIOUS))) {
            assertThatThrownBy(() -> JwtSigningKeys.load(active, "k", bad, profiles("prod")))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("MINNAL_JWT_EXTRA_PUBLIC_KEYS");
        }
    }

    @Test
    void extraKeyListToleratesSpacesAndEmptyEntries() {
        String extra = " a=" + TestKeys.publicPemBase64(PREVIOUS) + " , ,b=" + TestKeys.publicPemBase64(TestKeys.rsa(2048));
        List<RSAKey> keys = JwtSigningKeys.parseExtraPublicKeys(extra);
        assertThat(keys).extracting(JWK::getKeyID).containsExactly("a", "b");
    }
}
