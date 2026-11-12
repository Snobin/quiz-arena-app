package in.minnal.game.matchmaking.application;

import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * game-service's in-memory rating read model (AD-13, AD-16). Epic 2 feeds it from
 * {@code minnal.rating.updated}; until then it is empty. A missing entry, and any guest, counts as
 * {@link #DEFAULT_RATING}. Client-supplied ratings are never read.
 */
@Component
public class RatingCache {

    public static final int DEFAULT_RATING = 1200;

    private final ConcurrentHashMap<String, Integer> ratings = new ConcurrentHashMap<>();

    public int ratingOf(MinnalPrincipal player) {
        if (Matchmaking.isGuest(player)) {
            return DEFAULT_RATING;
        }
        return ratings.getOrDefault(player.sub(), DEFAULT_RATING);
    }

    /** Records a registered user's current Quick Match rating (Epic 2's consumer; tests). */
    public void put(String sub, int rating) {
        ratings.put(sub, rating);
    }
}
