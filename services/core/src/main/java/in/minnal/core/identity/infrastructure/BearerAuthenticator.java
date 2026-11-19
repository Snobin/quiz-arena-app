package in.minnal.core.identity.infrastructure;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import in.minnal.contracts.identity.MinnalClaims;
import in.minnal.contracts.identity.Role;
import in.minnal.core.identity.application.AccountRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

/**
 * Verifies Minnal bearer tokens on core's own authenticated endpoints with the public half of the signing
 * keys (JOSE only, no security starter). No or an invalid token is 401; a guest token is 403.
 */
@Component
public class BearerAuthenticator {

    /** An authenticated registered player. */
    public record Caller(UUID userId, Set<Role> roles) {
    }

    /** Authentication or authorisation failed; carries the HTTP status. */
    public static class Rejected extends RuntimeException {
        private final HttpStatus status;

        public Rejected(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }

        public HttpStatus status() {
            return status;
        }
    }

    private final JwtDecoder decoder;
    private final AccountRepository accounts;

    BearerAuthenticator(JwtSigningKeys keys, AccountRepository accounts) {
        this.accounts = accounts;
        DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
        processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, new ImmutableJWKSet<>(keys.publicJwkSet())));
        NimbusJwtDecoder nimbus = new NimbusJwtDecoder(processor);
        nimbus.setJwtValidator(JwtValidators.createDefaultWithIssuer(MinnalClaims.ISSUER));
        this.decoder = nimbus;
    }

    /** The registered caller for an {@code Authorization} header; USER or ADMIN only. */
    public Caller requireRegistered(String authorization) {
        if (authorization == null || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new Rejected(HttpStatus.UNAUTHORIZED, "Sign in to continue.");
        }
        Jwt jwt;
        try {
            jwt = decoder.decode(authorization.substring(7).trim());
        } catch (RuntimeException e) {
            throw new Rejected(HttpStatus.UNAUTHORIZED, "Invalid or expired token.");
        }
        Set<Role> roles;
        UUID userId;
        try {
            List<String> raw = jwt.getClaimAsStringList(MinnalClaims.ROLES);
            roles = raw == null ? Set.of() : raw.stream().map(BearerAuthenticator::role).filter(r -> r != null)
                    .collect(Collectors.toUnmodifiableSet());
            userId = UUID.fromString(jwt.getSubject());
        } catch (RuntimeException e) {
            throw new Rejected(HttpStatus.UNAUTHORIZED, "Invalid token.");
        }
        if (!roles.contains(Role.USER) && !roles.contains(Role.ADMIN)) {
            throw new Rejected(HttpStatus.FORBIDDEN, "Sign in with an account to use this.");
        }
        // A deleted or unknown account holding an unexpired token is signed out, not a 500 on a foreign key.
        if (accounts.findActive(userId).isEmpty()) {
            throw new Rejected(HttpStatus.UNAUTHORIZED, "Sign in again.");
        }
        return new Caller(userId, roles);
    }

    private static Role role(String name) {
        try {
            return Role.valueOf(name);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
