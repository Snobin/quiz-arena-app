package in.minnal.game.platform.infrastructure.security;

import in.minnal.contracts.identity.MinnalClaims;
import java.time.Instant;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import tools.jackson.databind.json.JsonMapper;

/**
 * game-service as a stateless OAuth2 resource server against core-service's JWKS (AD-9).
 *
 * <p>Tokens must be RS256, issued by {@code minnal-core}, with a valid {@code exp}/{@code nbf}
 * (60 s skew) and a {@code sub}. The JWKS ({@code minnal.security.jwks-uri}, env
 * {@code MINNAL_JWKS_URI}) is fetched lazily on the first token, so startup never needs core.
 * Public: {@code /actuator/health}, {@code /error} and {@code /ws} (the STOMP CONNECT frame carries
 * its own token, checked by {@link StompConnectAuthInterceptor} with this same decoder). Everything
 * else needs a valid bearer token.
 *
 * <p>ratings-service keeps a duplicate of this package (no shared Spring module, AD-1); only the
 * public path list differs.
 */
@Configuration(proxyBeanMethods = false)
public class SecurityConfig {

    static final String[] PUBLIC_PATHS = {"/actuator/health", "/actuator/health/**", "/error", "/ws"};

    @Bean
    JwtDecoder jwtDecoder(@Value("${minnal.security.jwks-uri}") String jwksUri) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwksUri)
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(MinnalClaims.ISSUER),
                new JwtClaimValidator<Instant>(JwtClaimNames.EXP, Objects::nonNull),
                new JwtClaimValidator<String>(JwtClaimNames.SUB, sub -> sub != null && !sub.isBlank())));
        return decoder;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtDecoder jwtDecoder, JsonMapper jsonMapper) throws Exception {
        ProblemDetailSecurityHandler problems = new ProblemDetailSecurityHandler(jsonMapper);
        http
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.decoder(jwtDecoder).jwtAuthenticationConverter(new MinnalJwtAuthenticationConverter()))
                        .authenticationEntryPoint(problems)
                        .accessDeniedHandler(problems)
                        // JWKS unreachable: 503 Problem Details instead of the default rethrow (a 500).
                        .withObjectPostProcessor(new ObjectPostProcessor<BearerTokenAuthenticationFilter>() {
                            @Override
                            public <O extends BearerTokenAuthenticationFilter> O postProcess(O filter) {
                                filter.setAuthenticationFailureHandler(problems);
                                return filter;
                            }
                        }))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(problems)
                        .accessDeniedHandler(problems));
        return http.build();
    }
}
