package in.minnal.core.identity.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.minnal.core.support.PostgresIntegrationTest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Guests are never persisted: no table, no migration, no row anywhere in the core schema. */
class GuestTokenPersistenceIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Test
    void issuingGuestTokensAddsNoTableOrRow() throws Exception {
        List<String> tablesBefore = tables();
        long rowsBefore = totalRows(tablesBefore);

        for (String lang : List.of("ml", "en")) {
            mvc.perform(post("/api/core/v1/auth/guest").contentType(MediaType.APPLICATION_JSON).content("{\"lang\":\"" + lang + "\"}"))
                    .andExpect(status().isOk());
        }

        assertThat(tables()).isEqualTo(tablesBefore)
                .containsExactly("app_user", "flyway_schema_history", "question", "question_version", "refresh_token", "subject", "topic", "user_identity");
        assertThat(jdbc.sql("SELECT version FROM flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank")
                .query(String.class).list()).containsExactly("1", "2", "3");
        assertThat(totalRows(tables())).isEqualTo(rowsBefore);
    }

    private List<String> tables() {
        return jdbc.sql("SELECT table_name FROM information_schema.tables WHERE table_schema = 'core' ORDER BY 1")
                .query(String.class).list();
    }

    private long totalRows(List<String> tables) {
        return tables.stream().mapToLong(t -> jdbc.sql("SELECT count(*) FROM " + t).query(Long.class).single()).sum();
    }
}
