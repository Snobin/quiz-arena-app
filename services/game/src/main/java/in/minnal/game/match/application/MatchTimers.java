package in.minnal.game.match.application;

import java.time.Duration;
import java.util.concurrent.Future;

/**
 * The shared {@code match-timers} scheduler. A task only {@code tell}s an event to its match actor;
 * it never touches match state.
 */
public interface MatchTimers {

    /** Runs {@code task} once after {@code delay}; the future cancels it. */
    Future<?> schedule(Duration delay, Runnable task);
}
