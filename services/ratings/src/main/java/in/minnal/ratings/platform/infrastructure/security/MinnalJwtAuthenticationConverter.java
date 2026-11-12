package in.minnal.ratings.platform.infrastructure.security;

import java.util.List;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/** Maps a verified token to a {@link MinnalAuthentication}: {@code roles: [GUEST]} becomes {@code ROLE_GUEST}. */
final class MinnalJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        MinnalPrincipal principal = MinnalPrincipal.from(jwt);
        List<GrantedAuthority> authorities = principal.roles().stream()
                .sorted()
                .<GrantedAuthority>map(role -> new SimpleGrantedAuthority("ROLE_" + role.name()))
                .toList();
        return new MinnalAuthentication(principal, jwt, authorities);
    }
}
