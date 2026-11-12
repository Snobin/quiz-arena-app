package in.minnal.core;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Context-load test. The {@code test} profile excludes the Flyway and Redis auto-configuration; the
 * DataSource is configured but never connects (the pool opens lazily and this test runs no query),
 * so this stays fast and Docker-free. Database behaviour is covered by the Testcontainers
 * integration tests, and the running stack by {@code deploy/verify-local.sh}.
 */
@SpringBootTest
@ActiveProfiles("test")
class CoreApplicationTests {

    @Test
    void contextLoads() {
    }
}
