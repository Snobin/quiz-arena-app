package in.minnal.game.room.application;

import java.time.Duration;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

/** One daemon thread, {@code room-timers}, shared by every live room. */
@Component
public class ScheduledRoomTimers implements RoomTimers, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(ScheduledRoomTimers.class);

    private final ScheduledThreadPoolExecutor executor;

    public ScheduledRoomTimers() {
        executor = new ScheduledThreadPoolExecutor(1, Thread.ofPlatform().name("room-timers").daemon(true).factory());
        executor.setRemoveOnCancelPolicy(true);
    }

    @Override
    public Future<?> schedule(Duration delay, Runnable task) {
        return executor.schedule(() -> {
            try {
                task.run();
            } catch (RuntimeException e) {
                log.error("room timer task failed", e);
            }
        }, Math.max(0, delay.toNanos()), TimeUnit.NANOSECONDS);
    }

    @Override
    public void destroy() {
        executor.shutdownNow();
    }
}
