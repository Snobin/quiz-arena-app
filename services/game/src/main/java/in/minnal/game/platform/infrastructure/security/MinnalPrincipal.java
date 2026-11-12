package in.minnal.game.platform.infrastructure.security;

import in.minnal.contracts.identity.MinnalClaims;
import in.minnal.contracts.identity.Role;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The caller's identity, taken only from a verified Minnal access token (AD-9): {@code sub},
 * {@code roles}, {@code name} and {@code lang}. Unknown role names are ignored.
 */
public record MinnalPrincipal(String sub, Set<Role> roles, String name, String lang) {

    public MinnalPrincipal {
        roles = roles.isEmpty() ? Set.of() : Set.copyOf(EnumSet.copyOf(roles));
    }

    public static MinnalPrincipal from(Jwt jwt) {
        return new MinnalPrincipal(jwt.getSubject(), roles(jwt), jwt.getClaimAsString(MinnalClaims.NAME),
                jwt.getClaimAsString(MinnalClaims.LANG));
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
