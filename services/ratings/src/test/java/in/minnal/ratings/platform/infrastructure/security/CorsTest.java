package in.minnal.ratings.platform.infrastructure.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The PWA lives on another origin in production (Cloudflare Pages), so the browser sends a preflight with an
 * Authorization header before every leaderboard call. Found on the first real deploy: no CORS rule existed.
 */
@SpringBootTest(properties = "minnal.cors.allowed-origins=https://minnal.example.in")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CorsTest {

    static final String PATH = "/api/ratings/v1/test/whoami";
    static final TestJwks JWKS = TestJwks.start();

    @DynamicPropertySource
    static void jwks(DynamicPropertyRegistry registry) {
        registry.add("minnal.security.jwks-uri", JWKS::uri);
    }

    @AfterAll
    static void stop() {
        JWKS.close();
    }

    @Autowired
    MockMvc mvc;

    @Test
    void aPreflightFromTheAppOriginIsAnsweredWithoutAToken() throws Exception {
        mvc.perform(options(PATH)
                        .header("Origin", "https://minnal.example.in")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://minnal.example.in"))
                .andExpect(header().string("Access-Control-Allow-Headers", org.hamcrest.Matchers.equalToIgnoringCase("authorization")));
    }

    @Test
    void anotherOriginIsRefused() throws Exception {
        mvc.perform(options(PATH)
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
    }

    @Test
    void theActualCallCarriesTheAllowOriginHeaderEvenWhenItIsRejected() throws Exception {
        mvc.perform(get(PATH).header("Origin", "https://minnal.example.in"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://minnal.example.in"));
    }
}
