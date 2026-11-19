package in.minnal.core.identity.application;

import in.minnal.contracts.identity.MinnalClaims;
import in.minnal.contracts.identity.Role;
import in.minnal.core.identity.infrastructure.JwtSigningKeys;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * Issues registered-player access tokens (AD-9): RS256 with the Story 1.5 key, 1 h, {@code sub} = user
 * id, {@code roles} recomputed on every issue (USER always, ADMIN when the verified email is listed in
 * {@code ADMIN_EMAILS}), {@code name} = the Google given name else "Player", and {@code lang}.
 */
@Service
public class UserTokenService {

    public static final Duration TTL = Duration.ofHours(1);
    static final Set<String> LANGUAGES = Set.of("ml", "en");
    static final String DEFAULT_NAME = "Player";

    private final JwtEncoder encoder;
    private final JwtSigningKeys keys;
    private final AuthSettings settings;
    private final Clock clock;

    public UserTokenService(JwtEncoder encoder, JwtSigningKeys keys, AuthSettings settings, Clock clock) {
        this.encoder = encoder;
        this.keys = keys;
        this.settings = settings;
        this.clock = clock;
    }

    /** Throws {@link UnsupportedLanguageException} unless {@code lang} is ml or en. Callers that rotate a token check first. */
    public static void requireSupported(String lang) {
        if (lang == null || !LANGUAGES.contains(lang)) {
            throw new UnsupportedLanguageException();
        }
    }

    public GuestToken issue(Account account, String lang) {
        requireSupported(lang);
        Instant issuedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        Instant expiresAt = issuedAt.plus(TTL);
        List<String> roles = settings.isAdminEmail(account.email())
                ? List.of(Role.USER.name(), Role.ADMIN.name())
                : List.of(Role.USER.name());
        String name = account.givenName() == null || account.givenName().isBlank() ? DEFAULT_NAME : account.givenName().trim();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(MinnalClaims.ISSUER)
                .subject(account.id().toString())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim(MinnalClaims.ROLES, roles)
                .claim(MinnalClaims.NAME, name)
                .claim(MinnalClaims.LANG, lang)
                .build();
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256).keyId(keys.activeKeyId()).build();
        return new GuestToken(encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue(), expiresAt);
    }
}
