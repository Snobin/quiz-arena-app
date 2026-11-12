package in.minnal.ratings.platform.infrastructure.security;

import java.util.Collection;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/** An authenticated request: the {@link MinnalPrincipal} plus its {@code ROLE_*} authorities. */
public final class MinnalAuthentication extends AbstractAuthenticationToken {

    private final MinnalPrincipal principal;
    private final Jwt token;

    MinnalAuthentication(MinnalPrincipal principal, Jwt token, Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.principal = principal;
        this.token = token;
        setAuthenticated(true);
    }

    @Override
    public MinnalPrincipal getPrincipal() {
        return principal;
    }

    /** The verified token. */
    @Override
    public Jwt getCredentials() {
        return token;
    }

    @Override
    public String getName() {
        return principal.sub();
    }
}
