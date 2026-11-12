package in.minnal.game.matchmaking.application;

import in.minnal.contracts.internal.QuestionSetResponse;
import in.minnal.game.platform.infrastructure.security.MinnalPrincipal;
import java.util.UUID;

/** Everything a matchmaking actor reacts to (AD-13); each is processed on the actor's thread. */
sealed interface MatchmakingEvent {

    /** The gate accepted a join (the participation claim is already held). */
    record Join(MinnalPrincipal player, String sessionId) implements MatchmakingEvent {
    }

    record Cancel(String sub, String sessionId) implements MatchmakingEvent {
    }

    /** The player's last session closed. */
    record Disconnect(String sub) implements MatchmakingEvent {
    }

    /** Every 250 ms: re-evaluate bands and bot fills against the clock. */
    record Tick() implements MatchmakingEvent {
    }

    /** The question-set fetch of {@code pairingId} finished: {@code set} or {@code failure}. */
    record SetFetched(UUID pairingId, QuestionSetResponse set, Throwable failure) implements MatchmakingEvent {
    }
}
