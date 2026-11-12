package in.minnal.core.question.infrastructure.seed;

import in.minnal.core.question.application.SeedRow;
import in.minnal.core.question.application.StarterSeedService;
import java.io.IOException;
import java.util.List;
import java.util.function.IntConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * One-shot starter loader, active only with the {@code seed} profile. It loads
 * {@code minnal.seed.file}, logs every problem and the summary, then exits the JVM: code 0 after a
 * completed run (even with skipped rows), 1 when the file cannot be read or the load fails.
 */
@Component
@Profile("seed")
public class SeedRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedRunner.class);

    private final StarterSeedService seedService;
    private final Resource seedFile;
    private final IntConsumer exit;

    @Autowired
    public SeedRunner(StarterSeedService seedService, @Value("${minnal.seed.file}") Resource seedFile,
            ConfigurableApplicationContext context) {
        this(seedService, seedFile, code -> System.exit(SpringApplication.exit(context, () -> code)));
    }

    SeedRunner(StarterSeedService seedService, Resource seedFile, IntConsumer exit) {
        this.seedService = seedService;
        this.seedFile = seedFile;
        this.exit = exit;
    }

    @Override
    public void run(ApplicationArguments args) {
        exit.accept(execute());
    }

    int execute() {
        List<SeedRow> rows;
        try {
            log.info("seeding questions from {}", seedFile.getDescription());
            rows = SeedCsvReader.read(seedFile);
        } catch (IOException e) {
            log.error("seed file {} could not be read: {}", seedFile.getDescription(), e.getMessage());
            return 1;
        }
        try {
            seedService.load(rows);
        } catch (RuntimeException e) {
            log.error("seeding failed: {}", e.toString(), e);
            return 1;
        }
        return 0;
    }
}
