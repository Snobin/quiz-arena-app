package in.minnal.core.question.infrastructure.seed;

import static org.assertj.core.api.Assertions.assertThat;

import in.minnal.core.question.application.SeedReport;
import in.minnal.core.question.application.StarterSeedService;
import in.minnal.core.support.PostgresIntegrationTest;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;

class SeedRunnerIntegrationTest extends PostgresIntegrationTest {

    @Autowired
    StarterSeedService seedService;

    @Test
    void unsignedStarterFileLoadsNothingAndEverySkipNamesReviewedBy() throws IOException {
        SeedReport report = seedService.load(SeedCsvReader.read(new ClassPathResource("seed/kerala-psc-starter.csv")));

        assertThat(report.summary()).isEqualTo("0 loaded · 30 rows skipped · 0 unchanged");
        assertThat(report.problems()).hasSize(30).allMatch(line -> line.matches(
                "row \\d+ · reviewedBy · required: every seeded question must name the admin who reviewed it"));
        assertThat(jdbc.sql("SELECT count(*) FROM question").query(Long.class).single()).isZero();
    }

    @Test
    void runnerExitsZeroAfterACompletedRun() {
        AtomicInteger exitCode = new AtomicInteger(-1);
        new SeedRunner(seedService, new ClassPathResource("seed/kerala-psc-starter.csv"), exitCode::set).run(null);
        assertThat(exitCode).hasValue(0);
    }

    @Test
    void runnerExitsOneWhenTheFileCannotBeRead() {
        AtomicInteger exitCode = new AtomicInteger(-1);
        new SeedRunner(seedService, new FileSystemResource("/nonexistent/seed.csv"), exitCode::set).run(null);
        assertThat(exitCode).hasValue(1);
    }
}
