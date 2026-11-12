package in.minnal.game.platform.session;

import java.util.Optional;
import java.util.UUID;

/** Who may see a live match: the subscription check of {@code /topic/match/{matchId}}. */
public interface MatchAccess {

    /** Whether {@code sub} is a human participant of the live match {@code matchId}. */
    default boolean isParticipant(UUID matchId, String sub) {
        return participantId(matchId, sub).isPresent();
    }

    /** {@code sub}'s participant id in the live match {@code matchId}, if she is in it. */
    Optional<UUID> participantId(UUID matchId, String sub);
}
