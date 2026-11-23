package in.minnal.game.metrics;

import in.minnal.game.match.application.MatchCompleted;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Completed matches per session (Story 7.3b). A session is one player's run of activity: it starts at her first inbound
 * frame after {@value #IDLE_MINUTES} minutes without one and ends that long after her last, when its count of completed
 * matches (zero included) goes into {@code minnal.session.matches}. Kept in memory per {@code sub}: open sessions are lost
 * on a restart. Aborted matches never count.
 */
@Component
public class PlayerSessionStats {

    static final int IDLE_MINUTES = 30;
    private static final Duration IDLE = Duration.ofMinutes(IDLE_MINUTES);

    private static final class Session {
        Instant last;
        int matches;

        Session(Instant last) {
            this.last = last;
        }
    }

    private final Map<String, Session> open = new ConcurrentHashMap<>();
    private final Clock clock;
    private final DistributionSummary matchesPerSession;
    private ScheduledExecutorService sweeper;

    public PlayerSessionStats(Clock clock, MeterRegistry meters) {
        this.clock = clock;
        this.matchesPerSession = DistributionSummary.builder("minnal.session.matches")
                .description("Completed matches per player session (30 min idle ends one)")
                .publishPercentiles(0.5)
                .publishPercentileHistogram()
                .register(meters);
    }

    @PostConstruct
    void start() {
        sweeper = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread thread = new Thread(r, "session-stats");
            thread.setDaemon(true);
            return thread;
        });
        sweeper.scheduleWithFixedDelay(this::sweep, 1, 1, TimeUnit.MINUTES);
    }

    @PreDestroy
    void stop() {
        if (sweeper != null) {
            sweeper.shutdownNow();
        }
    }

    /** Any inbound client frame from {@code sub}. */
    public void touch(String sub) {
        Instant now = clock.instant();
        open.compute(sub, (key, session) -> {
            if (session != null && Duration.between(session.last, now).compareTo(IDLE) >= 0) {
                matchesPerSession.record(session.matches);
                session = null;
            }
            if (session == null) {
                return new Session(now);
            }
            session.last = now;
            return session;
        });
    }

    @EventListener
    public void onCompleted(MatchCompleted event) {
        Instant now = clock.instant();
        for (String sub : event.setup().humans().keySet()) {
            open.compute(sub, (key, session) -> {
                Session current = session == null ? new Session(now) : session;
                current.matches++;
                return current;
            });
        }
    }

    /** Ends every session idle for 30 minutes. */
    public void sweep() {
        Instant now = clock.instant();
        for (Iterator<Map.Entry<String, Session>> it = open.entrySet().iterator(); it.hasNext();) {
            Map.Entry<String, Session> entry = it.next();
            open.computeIfPresent(entry.getKey(), (key, session) -> {
                if (Duration.between(session.last, now).compareTo(IDLE) >= 0) {
                    matchesPerSession.record(session.matches);
                    return null;
                }
                return session;
            });
        }
    }
}
