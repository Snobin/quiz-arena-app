package in.minnal.ratings.leaderboard;

import java.util.function.IntConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

/**
 * {@code ratings-service --rebuild-leaderboards} rebuilds every current board from Postgres and exits with 0 (or 1
 * when the rebuild failed); run it with {@code docker compose run --rm ratings-service --rebuild-leaderboards}. The
 * stream consumer and the relay do not run in that process. On a normal boot the boards are rebuilt when the
 * {@code builtAt} marker is missing (Valkey lost its keys) and the stream loops are enabled.
 */
@Component
class LeaderboardRunner implements ApplicationRunner {

    static final String OPTION = "rebuild-leaderboards";
    private static final Logger log = LoggerFactory.getLogger(LeaderboardRunner.class);

    private final LeaderboardRebuild rebuild;
    private final LeaderboardStore store;
    private final Boards boards;
    private final boolean bootRebuild;
    private final IntConsumer exit;

    @Autowired
    LeaderboardRunner(LeaderboardRebuild rebuild, LeaderboardStore store, Boards boards, ApplicationContext context,
                      @Value("${minnal.streams.enabled:true}") boolean streamsEnabled) {
        this(rebuild, store, boards, streamsEnabled, code -> System.exit(SpringApplication.exit(context, () -> code)));
    }

    /** For tests: the exit is injectable. */
    LeaderboardRunner(LeaderboardRebuild rebuild, LeaderboardStore store, Boards boards, boolean bootRebuild, IntConsumer exit) {
        this.rebuild = rebuild;
        this.store = store;
        this.boards = boards;
        this.bootRebuild = bootRebuild;
        this.exit = exit;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (args.containsOption(OPTION)) {
            int code = 0;
            try {
                rebuild.rebuildAll();
            } catch (Throwable e) {
                log.error("leaderboard rebuild failed", e);
                code = 1;
            }
            exit.accept(code);
            return;
        }
        if (!bootRebuild) {
            return;
        }
        try {
            if (!store.hasMarker(boards.builtAtKey())) {
                log.info("leaderboard marker missing: rebuilding from Postgres");
                rebuild.rebuildAll();
            }
        } catch (RuntimeException e) {
            // Valkey may not be reachable yet; the boards fill in as matches are rated, and the command can be run later.
            log.warn("could not check or rebuild the leaderboards at boot: {}", e.toString());
        }
    }
}
