package in.minnal.core.question.application;

import java.util.List;

/**
 * Outcome of a seed run. {@code problems} holds one {@code row N · field · problem} line per
 * problem of every skipped row.
 */
public record SeedReport(int loaded, int skipped, int unchanged, List<String> problems) {

    public SeedReport {
        problems = List.copyOf(problems);
    }

    public String summary() {
        return loaded + " loaded · " + skipped + " rows skipped · " + unchanged + " unchanged";
    }
}
