package in.minnal.game;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Context-load test. The {@code test} profile excludes the DataSource, Flyway and Redis
 * auto-configuration so this stays fast and Docker-free; the running stack is covered by
 * {@code deploy/verify-local.sh}.
 */
@SpringBootTest
@ActiveProfiles("test")
class GameApplicationTests {

    @Test
    void contextLoads() {
    }
}
