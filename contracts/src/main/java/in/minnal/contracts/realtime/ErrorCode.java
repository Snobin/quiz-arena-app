package in.minnal.contracts.realtime;

/** The {@code code} of an {@link ErrorPayload}. */
public enum ErrorCode {
    /** The STOMP session has no verified identity. */
    UNAUTHENTICATED,
    /** The {@code sub} is already queued, in a room or in a match ({@code matchId} or {@code roomId} set). */
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
    ANSWER_REJECTED,
    /** A Topic Duel join with no {@code topicId}, or one that is not a UUID. */
    INVALID_TOPIC,
    /** A room create needs a registered player with a finished profile (the token's {@code profileComplete}). */
    PROFILE_REQUIRED,
    /** A room's question count is missing or outside 5-30, or its source is missing (a configure that changes nothing too). */
    INVALID_ROOM_CONFIG,
    /** A room source other than {@code BANK} (custom topics arrive in Epic 6). */
    SOURCE_NOT_AVAILABLE,
    /** Only the room's host may do this. */
    NOT_HOST,
    /** The room action exists in the protocol but is not built yet (a valid start until Story 5.4, play again until 5.6). */
    NOT_AVAILABLE_YET,
    /** A join for a code that no live room has and no tombstone remembers (Story 5.3). */
    ROOM_NOT_FOUND,
    /** A join for a code whose room closed, expired or ended (a tombstone, kept 24 h). */
    ROOM_EXPIRED,
    /** A join for a room that already holds 50 humans, the host included. */
    ROOM_FULL,
    /** A join for a room that is starting or in a match. */
    ROOM_STARTED,
    /** A start from the host while fewer than 2 humans (the host counts) are in the lobby. */
    NOT_ENOUGH_PLAYERS
}
