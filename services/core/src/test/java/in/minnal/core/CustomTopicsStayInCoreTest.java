package in.minnal.core;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Story 6.3 (FR48, AD-3, AD-12): custom topics are private to core-service. No game or ratings code reads or writes
 * {@code custom_topic} or {@code custom_question}; only core's own customtopic package does (the account-deletion cleanup
 * goes through its repository interface).
 */
class CustomTopicsStayInCoreTest {

    private static final List<String> OTHER_SERVICES = List.of("../game/src/main", "../ratings/src/main");

    @Test
    void gameAndRatingsNeverMentionCustomTopicTables() throws IOException {
        List<String> violations = new ArrayList<>();
        for (String root : OTHER_SERVICES) {
            Path dir = Path.of(root);
            assertThat(dir).as("%s exists relative to services/core", root).exists();
            try (Stream<Path> files = Files.walk(dir)) {
                for (Path file : files.filter(f -> f.toString().matches(".*\\.(java|sql|xml|ya?ml|properties)")).toList()) {
                    String text = Files.readString(file);
                    if (text.contains("custom_topic") || text.contains("custom_question")) {
                        violations.add(file.toString());
                    }
                }
            }
        }
        assertThat(violations).isEmpty();
    }

    @Test
    void onlyTheCustomTopicPackageTouchesTheTablesInCore() throws IOException {
        List<String> violations = new ArrayList<>();
        try (Stream<Path> files = Files.walk(Path.of("src/main"))) {
            for (Path file : files.filter(f -> f.toString().matches(".*\\.(java|sql)")).toList()) {
                String path = file.toString().replace('\\', '/');
                if (path.contains("/customtopic/") || path.contains("/db/migration/")) {
                    continue;
                }
                String text = Files.readString(file);
                if (text.contains("custom_topic") || text.contains("custom_question")) {
                    violations.add(path);
                }
            }
        }
        assertThat(violations).isEmpty();
    }
}
