package in.minnal.ratings.rating.api;

import in.minnal.ratings.rating.Elo;
import in.minnal.ratings.rating.api.RatingsViews.HistoryEntry;
import in.minnal.ratings.rating.api.RatingsViews.MatchResult;
import in.minnal.ratings.rating.api.RatingsViews.ModeRating;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Read-only queries for the caller's own ratings and matches. Every query is keyed by the caller's user id. */
@Repository
class RatingsReadRepository {

    static final List<String> MODES = List.of("QUICK", "TOPIC_DUEL", "BATTLE_ROOM");

    private final JdbcClient jdbc;

    RatingsReadRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<MatchResult> matchResult(UUID userId, UUID matchId) {
        return jdbc.sql("""
                SELECT m.mode, m.rated, e.rating_before, e.rating_after, e.delta
                FROM match_record m
                LEFT JOIN rating_event e ON e.match_id = m.match_id AND e.user_id = m.user_id
                WHERE m.match_id = :match AND m.user_id = :user
                """)
                .param("match", matchId).param("user", userId)
                .query((rs, n) -> new MatchResult(matchId, rs.getString("mode"), rs.getBoolean("rated"),
                        (Integer) rs.getObject("rating_before"), (Integer) rs.getObject("rating_after"), (Integer) rs.getObject("delta")))
                .optional()
                // A rated record without its rating event is not a finished result (the two are written together, so
                // this should not happen): the caller is told "not yet" rather than "unrated".
                .filter(result -> !result.rated() || result.delta() != null);
    }

    List<ModeRating> ratings(UUID userId) {
        Map<String, Integer> held = new java.util.HashMap<>();
        jdbc.sql("SELECT mode, rating FROM rating WHERE user_id = :user").param("user", userId)
                .query((rs, n) -> held.put(rs.getString("mode"), rs.getInt("rating"))).list();
        List<ModeRating> out = new ArrayList<>();
        for (String mode : MODES) {
            out.add(new ModeRating(mode, held.getOrDefault(mode, Elo.START_RATING)));
        }
        return out;
    }

    List<HistoryEntry> matches(UUID userId, int limit) {
        return jdbc.sql("""
                SELECT match_id, mode, result, score, placement, rated, rating_delta, ended_at
                FROM match_record WHERE user_id = :user
                ORDER BY ended_at DESC, match_id LIMIT :limit
                """)
                .param("user", userId).param("limit", limit)
                .query((rs, n) -> new HistoryEntry(rs.getObject("match_id", UUID.class), rs.getString("mode"), rs.getString("result"),
                        rs.getInt("score"), rs.getInt("placement"), rs.getBoolean("rated"), (Integer) rs.getObject("rating_delta"),
                        rs.getTimestamp("ended_at").toInstant()))
                .list();
    }
}
