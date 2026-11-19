package in.minnal.ratings.rating;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * The only ELO in Minnal (AD-1, FR24, FR39). Pairwise: one rated player is compared with every other
 * participant, {@code E = 1 / (1 + 10^((Ropp - Rself) / 400))}, actual score 1, 0.5 or 0 from placement alone
 * (better placement wins, equal placement draws), {@code K = 32 / (N - 1)} so a 1v1 uses 32. The terms are
 * summed and rounded once, half away from zero; ratings are integers with no floor. Every delta is computed
 * from pre-match ratings, which the caller passes in.
 */
public final class Elo {

    public static final int START_RATING = 1200;
    private static final double BASE_K = 32.0;

    private Elo() {
    }

    /** A participant as the formula sees them: an effective rating and a placement (1 is best). */
    public record Player(int rating, int placement) {
    }

    /** {@code self}'s rating change against {@code others} (every other participant of the match). */
    public static int delta(Player self, List<Player> others) {
        if (others.isEmpty()) {
            return 0;
        }
        double k = BASE_K / others.size(); // N - 1 opponents
        double sum = 0;
        for (Player opponent : others) {
            double expected = 1.0 / (1.0 + Math.pow(10.0, (opponent.rating() - self.rating()) / 400.0));
            double actual = self.placement() < opponent.placement() ? 1.0 : self.placement() == opponent.placement() ? 0.5 : 0.0;
            sum += k * (actual - expected);
        }
        // BigDecimal HALF_UP rounds half away from zero, for negative values too.
        // Nine decimals first absorb floating-point noise, so an exact .5 total rounds away from zero as stated.
        return BigDecimal.valueOf(sum).setScale(9, RoundingMode.HALF_EVEN).setScale(0, RoundingMode.HALF_UP).intValue();
    }
}
