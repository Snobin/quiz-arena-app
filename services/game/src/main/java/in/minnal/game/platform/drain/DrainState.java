package in.minnal.game.platform.drain;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * The {@code draining} flag (NFR7, AD-19): set as soon as game-service begins to shut down, so new
 * joins fail with {@code SERVER_DRAINING}. It stops first (the highest phase); {@code MatchDrain}
 * then waits for live matches to finish, before the web server and the broker stop.
 */
@Component
public class DrainState implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(DrainState.class);

    private volatile boolean draining;
    private volatile boolean running;
    private final List<Runnable> listeners = new CopyOnWriteArrayList<>();

    public boolean isDraining() {
        return draining;
    }

    /**
     * Runs {@code listener} once when draining begins (rooms close their open lobbies then, Story 5.1). A listener
     * registered after draining began runs at once.
     */
    public void onBegin(Runnable listener) {
        boolean already;
        synchronized (this) {
            already = draining;
            if (!already) {
                listeners.add(listener);
            }
        }
        if (already) {
            try {
                listener.run();
            } catch (RuntimeException e) {
                log.error("a drain listener failed", e);
            }
        }
    }

    /** Starts draining (shutdown, or a test). There is no way back short of a restart. */
    public void begin() {
        boolean first;
        synchronized (this) {
            first = !draining;
            draining = true;
        }
        if (first) {
            log.info("draining: new joins are refused");
            for (Runnable listener : listeners) {
                try {
                    listener.run();
                } catch (RuntimeException e) {
                    log.error("a drain listener failed", e);
                }
            }
        }
    }

    /**
     * A (re)start clears the flag. In production the lifecycle starts once; a restart only happens
     * when a paused context resumes (Spring's test context cache stops unused contexts).
     */
    @Override
    public void start() {
        draining = false;
        running = true;
    }

    @Override
    public void stop() {
        begin();
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        return Integer.MAX_VALUE;
    }
}
