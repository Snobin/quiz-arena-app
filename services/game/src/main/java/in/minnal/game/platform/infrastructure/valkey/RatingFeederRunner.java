package in.minnal.game.platform.infrastructure.valkey;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Runs {@link RatingFeeder#pollOnce} on its own daemon thread, so the match and matchmaking actors never wait on Valkey. */
final class RatingFeederRunner implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(RatingFeederRunner.class);
    static final long RETRY_AFTER_MS = 1_000;

    /** Any failure, including an Error, is logged and retried: a dead feeder would leave the cache stale for good. */
    private final Thread thread;
    private volatile boolean running = true;

    RatingFeederRunner(RatingFeeder feeder) {
        feeder.announce();
        this.thread = new Thread(() -> {
            while (running) {
                try {
                    feeder.pollOnce();
                } catch (Throwable e) {
                    if (!running) {
                        return;
                    }
                    // Valkey unreachable or a read failed: the position is unchanged, so the same read is retried.
                    log.warn("rating cache read failed, retrying: {}", e.toString());
                    try {
                        Thread.sleep(RETRY_AFTER_MS);
                    } catch (InterruptedException interrupted) {
                        return;
                    }
                }
            }
        }, "rating-cache-feeder");
        thread.setDaemon(true);
        thread.start();
    }

    @Override
    public void close() {
        running = false;
        thread.interrupt();
        try {
            thread.join(2_000);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
