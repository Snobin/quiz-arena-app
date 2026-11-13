package in.minnal.contracts.realtime;

import java.time.Instant;
import java.util.UUID;

/**
 * {@code REMATCH_REQUESTED} (private, about the ended match; Story 1.10): a human asked for a
 * rematch. Sent to both humans: the requester shows her waiting state, the opponent "Accept rematch".
 * A re-send refreshes {@code expiresAt}.
 *
 * @param requestedBy the requester's participant id in the ended match
 * @param expiresAt   when the request lapses ({@code REMATCH_EXPIRED}) unless the opponent accepts
 */
public record RematchRequestedPayload(UUID requestedBy, Instant expiresAt) {
}
