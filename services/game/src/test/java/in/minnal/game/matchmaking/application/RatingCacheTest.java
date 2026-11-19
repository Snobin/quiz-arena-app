package in.minnal.game.matchmaking.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class RatingCacheTest {

    static final Instant T0 = Instant.parse("2026-11-19T10:00:00Z");

    @Test
    void aMissingEntryIsTheStartRating() {
        assertThat(new RatingCache().ratingOf("nobody", "QUICK")).isEqualTo(1200);
    }

    @Test
    void theLatestRatedAtWinsSoAReplayedOlderValueNeverOverwritesANewerOne() {
        RatingCache cache = new RatingCache();
        cache.update("u", "QUICK", 1250, T0.plusSeconds(60));
        cache.update("u", "QUICK", 1200, T0); // an older value, delivered late (replay)
        assertThat(cache.ratingOf("u", "QUICK")).isEqualTo(1250);
        cache.update("u", "QUICK", 1275, T0.plusSeconds(120));
        assertThat(cache.ratingOf("u", "QUICK")).isEqualTo(1275);
    }

    @Test
    void theSameRatedAtReplacesSoARepeatedEntryIsHarmless() {
        RatingCache cache = new RatingCache();
        cache.update("u", "QUICK", 1250, T0);
        cache.update("u", "QUICK", 1250, T0);
        assertThat(cache.ratingOf("u", "QUICK")).isEqualTo(1250);
    }

    @Test
    void modesAreIndependent() {
        RatingCache cache = new RatingCache();
        cache.update("u", "QUICK", 1500, T0);
        cache.update("u", "TOPIC_DUEL", 1100, T0);
        assertThat(cache.ratingOf("u", "QUICK")).isEqualTo(1500);
        assertThat(cache.ratingOf("u", "TOPIC_DUEL")).isEqualTo(1100);
        assertThat(cache.ratingOf("u", "BATTLE_ROOM")).isEqualTo(1200);
    }
}
