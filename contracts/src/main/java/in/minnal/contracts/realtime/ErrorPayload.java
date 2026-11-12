package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * {@code ERROR}: a refused request.
 *
 * @param matchId the active match, for {@code ALREADY_IN_MATCH} and {@code CANCEL_REJECTED} when known
 */
public record ErrorPayload(ErrorCode code, UUID matchId) {
}
