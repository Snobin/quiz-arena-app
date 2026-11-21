package in.minnal.game.room.application;

import java.time.Duration;
import java.util.concurrent.Future;

/**
 * The shared {@code room-timers} scheduler (the seam tests replace, like {@code MatchTimers}). A task only
 * {@code tell}s an event to its room actor; it never touches room state.
 */
public interface RoomTimers {

    /** Runs {@code task} once after {@code delay}; the future cancels it. */
    Future<?> schedule(Duration delay, Runnable task);
}
