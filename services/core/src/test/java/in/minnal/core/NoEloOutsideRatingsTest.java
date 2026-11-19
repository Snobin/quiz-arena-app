package in.minnal.core;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Story 2.5 (AD-1): ratings-service is the sole ELO computer. Nothing in this service's main code computes ELO or
 * writes ratings: no ELO formula, and no SQL against the ratings tables.
 */
class NoEloOutsideRatingsTest {

    private static final List<Pattern> FORBIDDEN = List.of(
            Pattern.compile("\\bElo\\b", Pattern.CASE_INSENSITIVE),
            Pattern.compile("Math\\.pow\\(\\s*10(\\.0)?\\s*,"),
            Pattern.compile("expectedScore", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(\\w+\\.)?\"?(rating|ratings|rating_event|match_record)\\b", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\b(rating_event|match_record)\\b"));

    @Test
    void noMainSourceComputesEloOrWritesRatings() throws IOException {
        List<String> violations = new ArrayList<>();
        assertThat(Path.of("src/main")).exists();
        try (Stream<Path> files = Files.walk(Path.of("src/main"))) {
            for (Path file : files.filter(f -> f.toString().matches(".*\\.(java|sql|xml|ya?ml|properties)")).toList()) {
                String text = Files.readString(file);
                for (Pattern pattern : FORBIDDEN) {
                    if (pattern.matcher(text).find()) {
                        violations.add(file + " matches " + pattern);
                    }
                }
            }
        }
        assertThat(violations).isEmpty();
    }
}
