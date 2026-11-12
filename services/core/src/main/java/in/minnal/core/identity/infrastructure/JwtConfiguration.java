package in.minnal.core.identity.infrastructure;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/** Wires the JWT keys and the {@link NimbusJwtEncoder} that signs guest tokens (AD-9). */
@Configuration(proxyBeanMethods = false)
public class JwtConfiguration {

    @Bean
    JwtSigningKeys jwtSigningKeys(@Value("${minnal.jwt.signing-key:}") String signingKey,
                                  @Value("${minnal.jwt.key-id:}") String keyId,
                                  @Value("${minnal.jwt.extra-public-keys:}") String extraPublicKeys,
                                  Environment environment) {
        return JwtSigningKeys.load(signingKey, keyId, extraPublicKeys, environment);
    }

    /** Signs with the active key only: the extra (rotation) keys are public and never sign. */
    @Bean
    JwtEncoder jwtEncoder(JwtSigningKeys keys) {
        return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(keys.signingKey())));
    }

    @Bean
    @ConditionalOnMissingBean
    Clock clock() {
        return Clock.systemUTC();
    }
}
