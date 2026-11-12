package in.minnal.contracts.realtime;

/** The {@code code} of an {@link ErrorPayload}. */
public enum ErrorCode {
    /** The STOMP session has no verified identity. */
    UNAUTHENTICATED,
    /** The {@code sub} is already queued or in a match ({@code matchId} set when in a match). */
    ALREADY_IN_MATCH,
    /** game-service is shutting down; try again in a moment. */
    SERVER_DRAINING,
    /** Too many inbound messages on this connection; the excess frames were dropped. */
    RATE_LIMITED,
    /** The caller's role may not play this mode (a guest on anything but QUICK). */
    FORBIDDEN_MODE,
    /** The mode exists but is not open yet. */
    MODE_UNAVAILABLE,
    /** A cancel arrived after the pairing formed; the match goes ahead. */
    CANCEL_REJECTED,
    /** A cancel arrived while the player was not queued. */
    NOT_IN_QUEUE,
    /** The request could not be understood (e.g. an unknown mode). */
    BAD_REQUEST,
    /** The sender is not a participant of that match, or the match is not live. */
    NOT_IN_MATCH,
    /** An answer for a question that is not open, after the deadline, or with an option outside 0–3. */
    ANSWER_REJECTED
}
