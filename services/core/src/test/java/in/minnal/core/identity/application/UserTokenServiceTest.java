package in.minnal.core.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jwt.SignedJWT;
import in.minnal.contracts.identity.MinnalClaims;
import in.minnal.core.identity.infrastructure.JwtSigningKeys;
import in.minnal.core.identity.infrastructure.TestKeys;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

class UserTokenServiceTest {

    final Clock clock = Clock.fixed(Instant.parse("2026-11-19T10:00:00Z"), ZoneOffset.UTC);
    final JwtSigningKeys keys = JwtSigningKeys.load(TestKeys.privatePemBase64(TestKeys.rsa(2048)), "k1", "", new MockEnvironment());

    UserTokenService service(Set<String> admins) {
        AuthSettings settings = new AuthSettings(URI.create("http://localhost:5173"), true, admins, List.of());
        return new UserTokenService(new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(keys.signingKey()))), keys, settings, clock);
    }

    @Test
    void adminIsRecomputedOnEveryIssueFromTheCurrentList() throws Exception {
        Account account = new Account(UUID.randomUUID(), "Admin@Example.com", "Anju");

        var listed = SignedJWT.parse(service(Set.of("admin@example.com")).issue(account, "en").accessToken()).getJWTClaimsSet();
        var removed = SignedJWT.parse(service(Set.of()).issue(account, "en").accessToken()).getJWTClaimsSet();

        assertThat(listed.getStringListClaim(MinnalClaims.ROLES)).containsExactly("USER", "ADMIN");
        assertThat(removed.getStringListClaim(MinnalClaims.ROLES)).containsExactly("USER");
    }

    @Test
    void expiresAnHourAfterIssueAndRejectsAnUnsupportedLanguage() throws Exception {
        UserTokenService service = service(Set.of());
        Account account = new Account(UUID.randomUUID(), null, null);

        GuestToken token = service.issue(account, "ml");

        assertThat(token.expiresAt()).isEqualTo(Instant.parse("2026-11-19T11:00:00Z"));
        assertThat(SignedJWT.parse(token.accessToken()).getJWTClaimsSet().getStringClaim(MinnalClaims.NAME)).isEqualTo("Player");
        assertThatThrownBy(() -> service.issue(account, "fr")).isInstanceOf(UnsupportedLanguageException.class);
    }
}
