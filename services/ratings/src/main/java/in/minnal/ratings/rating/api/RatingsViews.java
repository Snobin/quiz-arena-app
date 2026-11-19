package in.minnal.ratings.rating.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** The response shapes of the read endpoints (FR7, FR8). Absent optional fields are left out, never null. */
final class RatingsViews {

    private RatingsViews() {
    }

    /** {@code GET /matches/{matchId}}: the caller's own result of one match. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record MatchResult(UUID matchId, String mode, boolean rated, Integer ratingBefore, Integer ratingAfter, Integer delta) {
    }

    record ModeRating(String mode, int rating) {
    }

    /** {@code GET /me/ratings}: all three modes, 1200 for a mode never rated. */
    record MyRatings(List<ModeRating> ratings) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record HistoryEntry(UUID matchId, String mode, String result, int score, int placement, boolean rated, Integer ratingDelta,
                        Instant endedAt) {
    }

    /** {@code GET /me/matches}: the caller's most recent completed matches, newest first. */
    record MyMatches(List<HistoryEntry> matches) {
    }
}
