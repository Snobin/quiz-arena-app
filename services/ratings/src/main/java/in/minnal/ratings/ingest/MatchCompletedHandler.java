package in.minnal.ratings.ingest;

import in.minnal.contracts.events.CompletedParticipant;
import in.minnal.contracts.events.MatchCompletedEvent;
import in.minnal.contracts.events.RatingUpdatedStream;
import in.minnal.contracts.realtime.ParticipantKind;
import in.minnal.ratings.outbox.OutboxRepository;
import in.minnal.ratings.rating.Elo;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Applies one {@code minnal.match.completed} (AD-8, AD-15). In one transaction, for every USER participant:
 * a rating event, the new rating, a match record and a {@code minnal.rating.updated} outbox row (rated
 * matches), or just an unrated match record. GUEST and BOT participants are never stored. The unique
 * {@code (match_id, user_id)} keys make a second copy of the same match a no-op, whatever its event id.
 */
@Service
public class MatchCompletedHandler {

    public static final String RATING_UPDATED = RatingUpdatedStream.STREAM;
    private static final Logger log = LoggerFactory.getLogger(MatchCompletedHandler.class);

    /** What handling did, for logs and tests. */
    public enum Outcome { APPLIED, DUPLICATE }

    private final JdbcClient jdbc;
    private final TransactionTemplate tx;
    private final OutboxRepository outbox;
    private final JsonMapper json;

    public MatchCompletedHandler(JdbcClient jdbc, TransactionTemplate tx, OutboxRepository outbox, JsonMapper json) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.outbox = outbox;
        this.json = json;
    }

    public Outcome handle(MatchCompletedEvent event) {
        try {
            Outcome outcome = tx.execute(status -> event.rated() ? applyRated(event) : applyUnrated(event));
            if (outcome == Outcome.DUPLICATE) {
                log.info("match {} already applied; event {} ignored", event.matchId(), event.eventId());
            }
            return outcome;
        } catch (DuplicateKeyException conflict) {
            // A concurrent copy of the same match committed first: the unique keys say this one changes nothing.
            // Any other unique violation is a data error, not a replay, and must not be acknowledged as one.
            if (matchRecorded(event.matchId())) {
                return Outcome.DUPLICATE;
            }
            throw conflict;
        }
    }

    private boolean matchRecorded(UUID matchId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM match_record WHERE match_id = :m)").param("m", matchId).query(Boolean.class).single();
    }

    /** The USER participants with an id; a user listed twice is a malformed event (poison), never a silent no-op. */
    private List<CompletedParticipant> users(MatchCompletedEvent event) {
        List<CompletedParticipant> users = event.participants().stream()
                .filter(p -> p.kind() == ParticipantKind.USER && p.userId() != null && !p.userId().isBlank())
                .toList();
        long distinct = users.stream().map(CompletedParticipant::userId).distinct().count();
        if (distinct != users.size()) {
            throw new IllegalArgumentException("match " + event.matchId() + " lists a user twice");
        }
        return withoutDeleted(users);
    }

    /** A tombstoned (deleted) player gets no rating, event or record; she still counts as 1200 for her opponents. */
    private List<CompletedParticipant> withoutDeleted(List<CompletedParticipant> users) {
        if (users.isEmpty()) {
            return users;
        }
        List<UUID> ids = users.stream().map(u -> UUID.fromString(u.userId())).toList();
        List<UUID> gone = jdbc.sql("SELECT user_id FROM player_directory WHERE user_id = ANY(:ids) AND tombstoned_at IS NOT NULL")
                .param("ids", ids.toArray(UUID[]::new)).query(UUID.class).list();
        return gone.isEmpty() ? users : users.stream().filter(u -> !gone.contains(UUID.fromString(u.userId()))).toList();
    }

    private Outcome applyUnrated(MatchCompletedEvent event) {
        List<CompletedParticipant> users = users(event);
        // As for a rated match: any record for this match means it was already applied, and nothing is half-written.
        if (matchRecorded(event.matchId())) {
            return Outcome.DUPLICATE;
        }
        for (CompletedParticipant user : users) {
            insertRecord(event, user, false, null);
        }
        return Outcome.APPLIED;
    }

    private Outcome applyRated(MatchCompletedEvent event) {
        List<CompletedParticipant> users = users(event);
        if (users.isEmpty()) {
            return Outcome.APPLIED;
        }
        String mode = event.mode().name();
        Instant now = event.endedAt();
        List<UUID> ids = users.stream().map(u -> UUID.fromString(u.userId())).distinct().sorted().toList();
        for (UUID id : ids) {
            jdbc.sql("INSERT INTO rating (user_id, mode, rating, matches_rated, updated_at) VALUES (:id, :mode, :start, 0, :at) ON CONFLICT DO NOTHING")
                    .param("id", id).param("mode", mode).param("start", Elo.START_RATING).param("at", Timestamp.from(now)).update();
        }
        // Locked in user-id order so two matches sharing players cannot deadlock.
        Map<UUID, Integer> before = new LinkedHashMap<>();
        for (UUID id : ids) {
            before.put(id, jdbc.sql("SELECT rating FROM rating WHERE user_id = :id AND mode = :mode FOR UPDATE")
                    .param("id", id).param("mode", mode).query(Integer.class).single());
        }
        if (matchRecorded(event.matchId())) {
            return Outcome.DUPLICATE;
        }
        // Every delta from pre-match ratings: compute all first, then write.
        Map<UUID, Integer> deltas = new LinkedHashMap<>();
        for (CompletedParticipant user : users) {
            UUID id = UUID.fromString(user.userId());
            int own = before.get(id);
            List<Elo.Player> others = new ArrayList<>();
            for (CompletedParticipant other : event.participants()) {
                if (other == user) {
                    continue;
                }
                int effective = switch (other.kind()) {
                    case USER -> other.userId() == null || other.userId().isBlank() ? Elo.START_RATING
                            : before.getOrDefault(UUID.fromString(other.userId()), Elo.START_RATING);
                    case GUEST -> Elo.START_RATING;
                    case BOT -> own;
                };
                others.add(new Elo.Player(effective, other.placement()));
            }
            deltas.put(id, Elo.delta(new Elo.Player(own, user.placement()), others));
        }
        for (CompletedParticipant user : users) {
            UUID id = UUID.fromString(user.userId());
            int delta = deltas.get(id);
            int after = before.get(id) + delta;
            jdbc.sql("UPDATE rating SET rating = :after, matches_rated = matches_rated + 1, updated_at = GREATEST(updated_at, :at) WHERE user_id = :id AND mode = :mode")
                    .param("after", after).param("at", Timestamp.from(now)).param("id", id).param("mode", mode).update();
            jdbc.sql("""
                    INSERT INTO rating_event (event_id, match_id, user_id, mode, rating_before, rating_after, delta, ended_at)
                    VALUES (:event, :match, :id, :mode, :before, :after, :delta, :at)
                    """)
                    .param("event", event.eventId()).param("match", event.matchId()).param("id", id).param("mode", mode)
                    .param("before", before.get(id)).param("after", after).param("delta", delta).param("at", Timestamp.from(now)).update();
            insertRecord(event, user, true, delta);
            outbox.add(RATING_UPDATED, ratingUpdated(id, mode, after, now), now);
        }
        return Outcome.APPLIED;
    }

    private int insertRecord(MatchCompletedEvent event, CompletedParticipant user, boolean rated, Integer delta) {
        return jdbc.sql("""
                INSERT INTO match_record (match_id, user_id, mode, placement, result, score, correct_count, forfeited, rated, rating_delta, ended_at)
                VALUES (:match, :id, :mode, :placement, :result, :score, :correct, :forfeited, :rated, :delta, :at)
                ON CONFLICT DO NOTHING
                """)
                .param("match", event.matchId()).param("id", UUID.fromString(user.userId())).param("mode", event.mode().name())
                .param("placement", user.placement()).param("result", result(event, user)).param("score", user.score())
                .param("correct", user.correctCount()).param("forfeited", user.forfeited()).param("rated", rated)
                .param("delta", delta).param("at", Timestamp.from(event.endedAt())).update();
    }

    /** WIN for a sole first place, DRAW for a shared first place, otherwise LOSS (a forfeiter by her placement). */
    static String result(MatchCompletedEvent event, CompletedParticipant user) {
        if (user.placement() != 1) {
            return "LOSS";
        }
        long first = event.participants().stream().filter(p -> p.placement() == 1).count();
        return first > 1 ? "DRAW" : "WIN";
    }

    private String ratingUpdated(UUID userId, String mode, int rating, Instant ratedAt) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventId", UUID.randomUUID().toString());
        payload.put("userId", userId.toString());
        payload.put("mode", mode);
        payload.put("rating", rating);
        payload.put("ratedAt", ratedAt.toString());
        return json.writeValueAsString(payload);
    }
}
