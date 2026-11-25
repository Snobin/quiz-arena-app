package in.minnal.core.identity.infrastructure;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.core.identity.application.AuthSettings;
import java.net.URI;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The PWA is a different origin from the API in production, so even the first call (guest token, a JSON POST)
 * needs a preflight answer. Found on the first real deploy: only /me and /auth/refresh had a CORS rule.
 */
@SpringJUnitWebConfig(ApiCorsTest.Web.class)
class ApiCorsTest {

    static final String APP = "https://minnal.example.in";

    @RestController
    @RequestMapping("/api/core/v1/auth")
    static class Stub {
        @PostMapping("/guest")
        String guest() {
            return "{}";
        }

        @PostMapping("/refresh")
        String refresh() {
            return "{}";
        }

        @PostMapping("/logout")
        String logout() {
            return "{}";
        }
    }

    /** The real {@code apiCors} bean from AuthConfiguration, registered the way Spring MVC would. */
    @Configuration
    @EnableWebMvc
    static class Web implements WebMvcConfigurer {
        @Override
        public void addCorsMappings(CorsRegistry registry) {
            AuthSettings settings = new AuthSettings(URI.create(APP), true, Set.of(), List.of(APP));
            new AuthConfiguration().apiCors(settings).addCorsMappings(registry);
        }

        @Bean
        Stub stub() {
            return new Stub();
        }
    }

    @Autowired
    WebApplicationContext context;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    @Test
    void theGuestTokenPreflightIsAllowedFromTheAppOrigin() throws Exception {
        mvc.perform(options("/api/core/v1/auth/guest")
                        .header("Origin", APP)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", APP))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    }

    @Test
    void onlyRefreshAndLogoutAllowCredentialsAndTheGuardHeader() throws Exception {
        for (String path : List.of("/api/core/v1/auth/refresh", "/api/core/v1/auth/logout")) {
            mvc.perform(options(path)
                            .header("Origin", APP)
                            .header("Access-Control-Request-Method", "POST")
                            .header("Access-Control-Request-Headers", "content-type,x-minnal-auth"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", APP))
                    .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        }
        mvc.perform(options("/api/core/v1/auth/guest")
                        .header("Origin", APP)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "x-minnal-auth"))
                .andExpect(status().isForbidden());
    }

    @Test
    void authorizationAndContentTypeAreAllowedOnTheGeneralRule() throws Exception {
        mvc.perform(options("/api/core/v1/auth/guest")
                        .header("Origin", APP)
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk());
    }

    @Test
    void anotherOriginIsRefused() throws Exception {
        mvc.perform(options("/api/core/v1/auth/guest")
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/core/v1/auth/guest").header("Origin", "https://evil.example"))
                .andExpect(status().isForbidden());
    }
}
