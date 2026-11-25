package in.minnal.core.identity.infrastructure;

import java.util.List;
import org.springframework.web.cors.CorsConfiguration;

/**
 * Cross-origin rules for the PWA, which is a different origin from the API in production (Cloudflare Pages vs
 * the VPS). {@link #general} covers every {@code /api/**} call from the configured browser origins, without
 * credentials. {@link #credentialed} adds credentials for the two endpoints that use the refresh cookie
 * (refresh and logout), which still check the origin and the {@code X-Minnal-Auth} guard themselves.
 *
 * <p>Register the credentialed paths before {@link #GENERAL_PATTERN}: the rules for a request are matched in order.
 */
public final class ApiCors {

    public static final String GENERAL_PATTERN = "/api/**";
    public static final List<String> CREDENTIALED_PATHS = List.of("/api/core/v1/auth/refresh", "/api/core/v1/auth/logout");

    private ApiCors() {
    }

    public static CorsConfiguration general(List<String> origins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setMaxAge(600L);
        return config;
    }

    public static CorsConfiguration credentialed(List<String> origins) {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("POST"));
        config.setAllowedHeaders(List.of("Content-Type", "X-Minnal-Auth"));
        config.setAllowCredentials(true);
        config.setMaxAge(600L);
        return config;
    }
}
