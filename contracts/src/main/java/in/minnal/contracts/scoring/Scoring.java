package in.minnal.contracts.scoring;

import java.time.Duration;

/**
 * The one scoring function of every mode (AD-6): a correct answer scores
 * {@code 500 + round(500 × remainingMs / 15000)}, so 1000 with the whole window left and 500 at
 * the deadline; a wrong or missing answer scores 0. {@code remainingMs} is clamped to the window.
 * Humans and bots are scored by this same call (AD-7).
 */
public final class Scoring {

    /** The answer window of a question. */
    public static final Duration WINDOW = Duration.ofSeconds(15);

    /** What a correct answer scores at the deadline. */
    public static final int BASE_POINTS = 500;

    /** The extra a correct answer earns with the whole window left. */
    public static final int SPEED_POINTS = 500;

    private static final long WINDOW_MS = WINDOW.toMillis();

    private Scoring() {
    }

    /**
     * @param correct     whether the picked option is the answer
     * @param remainingMs the server's deadline minus the server receive instant, in ms
     * @return the points the answer earns: 500–1000 when correct, else 0
     */
    public static int points(boolean correct, long remainingMs) {
        if (!correct) {
            return 0;
        }
        long clamped = Math.clamp(remainingMs, 0L, WINDOW_MS);
        return BASE_POINTS + (int) Math.round(SPEED_POINTS * clamped / (double) WINDOW_MS);
    }
}
