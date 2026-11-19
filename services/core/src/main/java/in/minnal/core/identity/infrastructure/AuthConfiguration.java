package in.minnal.core.identity.infrastructure;

import in.minnal.core.identity.application.AuthSettings;
import in.minnal.core.identity.application.LoginMethod;
import java.net.URI;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Sign-in wiring (AD-9). Everything secret or deployment-specific comes from the environment; the
 * refresh endpoint is the only one that allows credentialed cross-origin calls, and only from the PWA.
 */
@Configuration(proxyBeanMethods = false)
public class AuthConfiguration {

    private static List<String> csv(String value) {
        return Arrays.stream(value.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    @Bean
    AuthSettings authSettings(@Value("${minnal.auth.web-url}") URI webUrl,
                              @Value("${minnal.auth.cookie-secure}") boolean cookieSecure,
                              @Value("${minnal.auth.admin-emails:}") String adminEmails,
                              @Value("${minnal.cors.allowed-origins:}") String corsOrigins) {
        Set<String> admins = csv(adminEmails).stream().map(e -> e.toLowerCase(Locale.ROOT)).collect(Collectors.toUnmodifiableSet());
        AuthSettings base = new AuthSettings(webUrl, cookieSecure, admins, List.of());
        List<String> origins = new java.util.ArrayList<>(List.of(base.webOrigin()));
        csv(corsOrigins).forEach(o -> {
            if (!origins.contains(o)) {
                origins.add(o);
            }
        });
        return new AuthSettings(webUrl, cookieSecure, admins, List.copyOf(origins));
    }

    @Bean
    LoginMethod googleLoginMethod(@Value("${minnal.auth.google.client-id:}") String clientId,
                                  @Value("${minnal.auth.google.client-secret:}") String clientSecret,
                                  @Value("${minnal.auth.google.redirect-uri}") String redirectUri,
                                  @Value("${minnal.auth.google.authorization-uri}") URI authorizationUri,
                                  @Value("${minnal.auth.google.token-uri}") URI tokenUri,
                                  @Value("${minnal.auth.google.jwks-uri}") URI jwksUri,
                                  @Value("${minnal.auth.google.issuer}") String issuer) {
        return new GoogleLoginMethod(new GoogleLoginMethod.Settings(
                clientId, clientSecret, redirectUri, authorizationUri, tokenUri, jwksUri, issuer));
    }

    @Bean
    WebMvcConfigurer refreshCors(AuthSettings settings) {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/core/v1/auth/refresh")
                        .allowedOrigins(settings.corsOrigins().toArray(String[]::new))
                        .allowedMethods("POST")
                        .allowedHeaders("Content-Type", "X-Minnal-Auth")
                        .allowCredentials(true)
                        .maxAge(600);
            }
        };
    }
}
