package in.minnal.ratings.platform.infrastructure.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

/** Startup must not need core-service: the JWKS is fetched on the first token, not at boot. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LazyJwksTest {

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
    void theJwksIsFetchedOnTheFirstTokenNotAtStartup() throws Exception {
        assertThat(JWKS.fetches()).isZero();
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        assertThat(JWKS.fetches()).isZero();
        mvc.perform(get(ResourceServerTest.WHOAMI).header("Authorization", "Bearer " + JWKS.validToken()))
                .andExpect(status().isOk());
        assertThat(JWKS.fetches()).isEqualTo(1);
    }
}
