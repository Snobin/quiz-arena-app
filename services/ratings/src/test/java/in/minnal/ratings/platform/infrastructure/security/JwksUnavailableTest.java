package in.minnal.ratings.platform.infrastructure.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** core-service down: the service starts, and a well-formed token gets 503 Problem Details, not 500. */
@SpringBootTest(properties = "minnal.security.jwks-uri=http://127.0.0.1:1/unreachable/jwks")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class JwksUnavailableTest {

    @Autowired
    MockMvc mvc;

    @Test
    void anUnreachableJwksIs503ProblemDetail() throws Exception {
        try (TestJwks issuer = TestJwks.start()) {
            mvc.perform(get(ResourceServerTest.WHOAMI).header("Authorization", "Bearer " + issuer.validToken())
                            .header("X-Request-Id", "jwks-down-1"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.status").value(503))
                    .andExpect(jsonPath("$.detail").value("token keys unavailable"))
                    .andExpect(jsonPath("$.instance").value(ResourceServerTest.WHOAMI))
                    .andExpect(header().string("X-Request-Id", "jwks-down-1"));
        }
        // Health stays public and up.
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }
}
