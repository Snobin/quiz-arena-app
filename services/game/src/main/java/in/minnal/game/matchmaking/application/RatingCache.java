package in.minnal.game.matchmaking.application;

import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * game-service's in-memory rating read model (AD-13, AD-16), fed from {@code minnal.rating.updated} (see
 * {@code RatingFeeder}). Each {@code (userId, mode)} keeps the value with the latest {@code ratedAt}, so a replayed
 * older value never overwrites a newer one. A missing entry, and any guest, counts as {@link #DEFAULT_RATING}.
 * Client-supplied ratings are never read.
 */
@Component
public class RatingCache {

    public static final int DEFAULT_RATING = 1200;
    /** Matchmaking pairs by the Quick Match rating (the only rated mode that queues today). */
    public static final String QUICK = "QUICK";

    private record Rated(int rating, Instant ratedAt) {
    }

    private final ConcurrentHashMap<String, Rated> ratings = new ConcurrentHashMap<>();

    private static String key(String userId, String mode) {
        return userId + "|" + mode;
    }

    /** The player's Quick Match rating. */
    public int ratingOf(MinnalPrincipal player) {
        if (Matchmaking.isGuest(player)) {
            return DEFAULT_RATING;
        }
        return ratingOf(player.sub(), QUICK);
    }

    /** The player's rating in {@code mode} (a guest is always the default). */
    public int ratingOf(MinnalPrincipal player, in.minnal.contracts.realtime.MatchMode mode) {
        if (Matchmaking.isGuest(player)) {
            return DEFAULT_RATING;
        }
        return ratingOf(player.sub(), mode.name());
    }

    public int ratingOf(String userId, String mode) {
        Rated rated = ratings.get(key(userId, mode));
        return rated == null ? DEFAULT_RATING : rated.rating();
    }

    /** Records a rating only if {@code ratedAt} is not older than the one held (last write wins). */
    public void update(String userId, String mode, int rating, Instant ratedAt) {
        ratings.merge(key(userId, mode), new Rated(rating, ratedAt),
                (held, incoming) -> incoming.ratedAt().isBefore(held.ratedAt()) ? held : incoming);
    }

    /** Sets a registered user's Quick Match rating unconditionally (tests). */
    public void put(String sub, int rating) {
        ratings.put(key(sub, QUICK), new Rated(rating, Instant.EPOCH));
    }
}
