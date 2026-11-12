package in.minnal.game.matchmaking.domain;

import java.time.Duration;

/**
 * Pairing thresholds (AD-13): ±{@code band} rating, widening to ±{@code widenedBand} once a player
 * has waited {@code widenAfter}; a bot after {@code botAfter}.
 */
public record MatchmakingRules(int band, int widenedBand, Duration widenAfter, Duration botAfter) {

    public static final MatchmakingRules DEFAULT = new MatchmakingRules(200, 400, Duration.ofSeconds(4), Duration.ofSeconds(8));

    public MatchmakingRules {
        if (band < 0 || widenedBand < band || widenAfter.isNegative() || botAfter.compareTo(widenAfter) < 0) {
            throw new IllegalArgumentException("inconsistent matchmaking rules");
        }
    }

    /** The rating band of a player who has waited {@code waited}. */
    public int bandAfter(Duration waited) {
        return waited.compareTo(widenAfter) >= 0 ? widenedBand : band;
    }

    public boolean botDue(Duration waited) {
        return waited.compareTo(botAfter) >= 0;
    }
}
