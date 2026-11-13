package in.minnal.game.match.application;

import in.minnal.game.match.domain.MatchSetup;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * Published (as a Spring application event, on the match's thread) when a completed QUICK match
 * ends, after its humans were released: the rematch window of that match opens (Story 1.10).
 *
 * @param setup                   the ended match's setup (participants, humans, ratings)
 * @param forfeitedParticipantIds who forfeited (left, or ran out of reconnect grace) during it
 * @param endedAt                 when the match ended
 */
public record MatchCompletedForRematch(MatchSetup setup, Set<UUID> forfeitedParticipantIds, Instant endedAt) {

    public MatchCompletedForRematch {
        forfeitedParticipantIds = Set.copyOf(forfeitedParticipantIds);
    }
}
