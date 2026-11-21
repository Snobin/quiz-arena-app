package in.minnal.game.support;

import in.minnal.game.room.application.RoomTimers;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Future;
import java.util.function.Predicate;
import java.util.concurrent.CompletableFuture;

/**
 * Room timers that fire only when a test says so (no sleeps): {@link #fire} runs the pending tasks whose delay matches,
 * {@link #clear} forgets them. A cancelled timer never fires.
 */
public final class ManualRoomTimers implements RoomTimers {

    /** One scheduled task: its delay when scheduled, and its future. */
    public record Timer(Duration delay, Runnable task, CompletableFuture<Void> future) {
    }

    private final List<Timer> timers = new CopyOnWriteArrayList<>();

    @Override
    public Future<?> schedule(Duration delay, Runnable task) {
        Timer timer = new Timer(delay, task, new CompletableFuture<>());
        timers.add(timer);
        return timer.future();
    }

    /** The timers that are neither fired nor cancelled. */
    public List<Timer> pending() {
        return timers.stream().filter(t -> !t.future().isDone()).toList();
    }

    /** Fires every pending timer whose delay satisfies {@code which}; returns how many fired. */
    public int fire(Predicate<Duration> which) {
        List<Timer> due = new ArrayList<>(pending().stream().filter(t -> which.test(t.delay())).toList());
        due.forEach(t -> {
            t.future().complete(null);
            t.task().run();
        });
        return due.size();
    }

    public void clear() {
        timers.forEach(t -> t.future().cancel(false));
        timers.clear();
    }
}
