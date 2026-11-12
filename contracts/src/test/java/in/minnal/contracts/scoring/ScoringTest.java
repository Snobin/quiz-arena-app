package in.minnal.contracts.scoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ScoringTest {

    @ParameterizedTest(name = "correct with {0} ms left → {1}")
    @CsvSource({
            "15000, 1000",
            "7500, 750",
            "0, 500",
            "14999, 1000", // 999.97 rounds up
            "14, 500", // 0.47 rounds down
            "15, 501", // 0.5 rounds half up
            "1, 500",
            "3000, 600",
    })
    void aCorrectAnswerScores500PlusTheSpeedShare(long remainingMs, int points) {
        assertThat(Scoring.points(true, remainingMs)).isEqualTo(points);
    }

    @Test
    void remainingTimeIsClampedToTheWindow() {
        assertThat(Scoring.points(true, -1)).isEqualTo(500);
        assertThat(Scoring.points(true, Long.MIN_VALUE)).isEqualTo(500);
        assertThat(Scoring.points(true, 15_001)).isEqualTo(1000);
        assertThat(Scoring.points(true, Long.MAX_VALUE)).isEqualTo(1000);
    }

    @Test
    void aWrongOrMissingAnswerScoresZeroWhateverTheTime() {
        assertThat(Scoring.points(false, 15_000)).isZero();
        assertThat(Scoring.points(false, 0)).isZero();
        assertThat(Scoring.points(false, -5)).isZero();
    }

    @Test
    void theWindowIs15s() {
        assertThat(Scoring.WINDOW).isEqualTo(Duration.ofSeconds(15));
    }

    /** The property test: every millisecond of the window, against the formula and its invariants. */
    @Test
    void exhaustiveSweepOfTheWindow() {
        int previous = Integer.MIN_VALUE;
        for (long ms = 0; ms <= 15_000; ms++) {
            int points = Scoring.points(true, ms);
            assertThat(points).as("at %d ms", ms).isEqualTo(500 + Math.round(500 * ms / 15000.0));
            assertThat(points).as("at %d ms", ms).isBetween(500, 1000);
            assertThat(points).as("monotone at %d ms", ms).isGreaterThanOrEqualTo(previous);
            assertThat(Scoring.points(false, ms)).as("wrong at %d ms", ms).isZero();
            previous = points;
        }
    }
}
