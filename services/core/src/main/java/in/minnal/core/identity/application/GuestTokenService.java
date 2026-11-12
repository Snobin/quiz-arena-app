package in.minnal.core.identity.application;

import in.minnal.contracts.identity.MinnalClaims;
import in.minnal.contracts.identity.Role;
import in.minnal.core.identity.infrastructure.JwtSigningKeys;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * Issues guest access tokens (AD-9): RS256, 24 h, a random UUID {@code sub}, {@code roles: [GUEST]},
 * a generated {@code name} ("Guest 4821", the same in both languages) and the requested
 * {@code lang}. Nothing about the guest is stored anywhere.
 */
@Service
public class GuestTokenService {

    public static final Duration TTL = Duration.ofHours(24);
    static final Set<String> LANGUAGES = Set.of("ml", "en");
    static final String NAME_PREFIX = "Guest ";

    private final JwtEncoder encoder;
    private final JwtSigningKeys keys;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public GuestTokenService(JwtEncoder encoder, JwtSigningKeys keys, Clock clock) {
        this.encoder = encoder;
        this.keys = keys;
        this.clock = clock;
    }

    public GuestToken issue(String lang) {
        if (lang == null || !LANGUAGES.contains(lang)) {
            throw new UnsupportedLanguageException();
        }
        // JWT NumericDate has whole seconds; truncating keeps expiresAt equal to the exp claim.
        Instant issuedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        Instant expiresAt = issuedAt.plus(TTL);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(MinnalClaims.ISSUER)
                .subject(UUID.randomUUID().toString())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim(MinnalClaims.ROLES, List.of(Role.GUEST.name()))
                .claim(MinnalClaims.NAME, NAME_PREFIX + (1000 + random.nextInt(9000)))
                .claim(MinnalClaims.LANG, lang)
                .build();
        JwsHeader header = JwsHeader.with(SignatureAlgorithm.RS256).keyId(keys.activeKeyId()).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new GuestToken(token, expiresAt);
    }
}
