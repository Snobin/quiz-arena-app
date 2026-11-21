package in.minnal.contracts.realtime;

import java.util.UUID;

/**
 * {@code ERROR}: a refused request.
 *
 * @param matchId the match the error is about when known: the active one for {@code ALREADY_IN_MATCH} and
 *                {@code CANCEL_REJECTED}, the addressed one for {@code NOT_IN_MATCH} and {@code ANSWER_REJECTED}
 * @param roomId  the Battle Room the error is about when known: the active one for {@code ALREADY_IN_MATCH}, the
 *                addressed one for room commands ({@code NOT_HOST}, {@code NOT_AVAILABLE_YET}, config errors)
 */
public record ErrorPayload(ErrorCode code, UUID matchId, UUID roomId) {

    /** An error about no room. */
    public ErrorPayload(ErrorCode code, UUID matchId) {
        this(code, matchId, null);
    }
}
