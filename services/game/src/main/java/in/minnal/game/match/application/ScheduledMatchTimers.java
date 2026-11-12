package in.minnal.game.match.application;

import java.time.Duration;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

/** One daemon thread, {@code match-timers}, shared by every live match. */
@Component
public class ScheduledMatchTimers implements MatchTimers, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(ScheduledMatchTimers.class);

    private final ScheduledThreadPoolExecutor executor;

    public ScheduledMatchTimers() {
        executor = new ScheduledThreadPoolExecutor(1, Thread.ofPlatform().name("match-timers").daemon(true).factory());
        executor.setRemoveOnCancelPolicy(true);
    }

    @Override
    public Future<?> schedule(Duration delay, Runnable task) {
        return executor.schedule(() -> {
            try {
                task.run();
            } catch (RuntimeException e) {
                log.error("match timer task failed", e);
            }
        }, Math.max(0, delay.toNanos()), TimeUnit.NANOSECONDS);
    }

    @Override
    public void destroy() {
        executor.shutdownNow();
    }
}
