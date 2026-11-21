package in.minnal.game.platform.infrastructure.security;

import in.minnal.contracts.identity.MinnalClaims;
import in.minnal.contracts.identity.Role;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The caller's identity, taken only from a verified Minnal access token (AD-9): {@code sub},
 * {@code roles}, {@code name}, {@code lang} and {@code profileComplete}. Unknown role names are ignored.
 *
 * @param profileComplete the token's {@code profileComplete} claim; a token issued before the claim existed lacks
 *                        it and counts as incomplete until it is refreshed (Story 5.1)
 */
public record MinnalPrincipal(String sub, Set<Role> roles, String name, String lang, boolean profileComplete) {

    public MinnalPrincipal {
        roles = roles.isEmpty() ? Set.of() : Set.copyOf(EnumSet.copyOf(roles));
    }

    /** A principal whose profile is not known to be complete. */
    public MinnalPrincipal(String sub, Set<Role> roles, String name, String lang) {
        this(sub, roles, name, lang, false);
    }

    public static MinnalPrincipal from(Jwt jwt) {
        return new MinnalPrincipal(jwt.getSubject(), roles(jwt), jwt.getClaimAsString(MinnalClaims.NAME),
                jwt.getClaimAsString(MinnalClaims.LANG),
                Boolean.TRUE.equals(jwt.getClaim(MinnalClaims.PROFILE_COMPLETE)));
    }

    static Set<Role> roles(Jwt jwt) {
        List<String> names = jwt.hasClaim(MinnalClaims.ROLES) ? jwt.getClaimAsStringList(MinnalClaims.ROLES) : List.of();
        EnumSet<Role> roles = EnumSet.noneOf(Role.class);
        for (String name : names == null ? List.<String>of() : names) {
            for (Role role : Role.values()) {
                if (role.name().equals(name)) {
                    roles.add(role);
                }
            }
        }
        return roles;
    }

    public boolean hasRole(Role role) {
        return roles.contains(role);
    }
}
