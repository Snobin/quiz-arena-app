package in.minnal.core.identity.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** With no Google credentials configured (the default), start fails cleanly instead of redirecting. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GoogleNotConfiguredTest {

    @Autowired
    MockMvc mvc;

    @Test
    void startAnswers503WithoutARedirectOrCookie() throws Exception {
        mvc.perform(get("/api/core/v1/auth/google/start?returnTo=/"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Location"))
                .andExpect(header().doesNotExist("Set-Cookie"));
    }
}
