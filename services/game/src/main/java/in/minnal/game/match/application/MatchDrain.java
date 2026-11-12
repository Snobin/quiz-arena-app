package in.minnal.game.match.application;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * Graceful drain of live matches (NFR7, AD-19). It stops just after {@code DrainState} (which
 * refuses new joins) and before the web server and the broker, and blocks the shutdown until no
 * match is live or {@code minnal.match.drain-timeout} (5 min) passes, so matches in play finish.
 */
@Component
public class MatchDrain implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(MatchDrain.class);

    private final MatchRegistry matches;
    private final Duration timeout;
    private volatile boolean running;

    public MatchDrain(MatchRegistry matches, @Value("${minnal.match.drain-timeout:5m}") Duration timeout) {
        this.matches = matches;
        this.timeout = timeout;
    }

    /**
     * Spring cuts each shutdown phase at {@code spring.lifecycle.timeout-per-shutdown-phase} (default
     * 30 s), so a shorter value than the drain timeout silently cuts live matches.
     */
    @Autowired
    MatchDrain(MatchRegistry matches, @Value("${minnal.match.drain-timeout:5m}") Duration timeout,
            @Value("${spring.lifecycle.timeout-per-shutdown-phase:30s}") Duration phaseTimeout, Environment environment) {
        this(matches, timeout);
        checkPhaseTimeout(phaseTimeout, timeout, environment.matchesProfiles("prod"));
    }

    /**
     * Fails under prod, else warns, when {@code phaseTimeout} is shorter than {@code drainTimeout}.
     *
     * @return whether the configuration is sound
     */
    static boolean checkPhaseTimeout(Duration phaseTimeout, Duration drainTimeout, boolean prod) {
        if (phaseTimeout.compareTo(drainTimeout) >= 0) {
            return true;
        }
        String message = "spring.lifecycle.timeout-per-shutdown-phase (" + phaseTimeout
                + ") is shorter than minnal.match.drain-timeout (" + drainTimeout + "): shutdown would cut live matches";
        if (prod) {
            throw new IllegalStateException(message);
        }
        log.warn(message);
        return false;
    }

    @Override
    public void start() {
        running = true;
    }

    @Override
    public void stop() {
        int live = matches.liveCount();
        if (live > 0) {
            log.info("draining: waiting up to {} for {} live match(es)", timeout, live);
            try {
                if (!matches.awaitNoLiveMatches(timeout)) {
                    log.warn("drain timed out with {} match(es) still live", matches.liveCount());
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        running = false;
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    /** Just below {@code DrainState} (Integer.MAX_VALUE): stops right after joins are refused. */
    @Override
    public int getPhase() {
        return Integer.MAX_VALUE - 1;
    }
}
