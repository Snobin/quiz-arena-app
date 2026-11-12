package in.minnal.contracts.realtime;

/**
 * The {@code type} of a {@link ServerMessage} (AD-10). Broadcasts carry {@code seq}; private
 * messages ({@code /user/queue/game}) carry {@code refSeq} when they reflect a broadcast.
 */
public enum MessageType {
    /** Private: the pairing formed and the question set is ready ({@link MatchFoundPayload}). */
    MATCH_FOUND,
    /** Private: the pairing could not start, e.g. the question set was unavailable ({@link MatchmakingFailedPayload}). */
    MATCHMAKING_FAILED,
    /** Private: the cancel was accepted; the player is idle again. No payload. */
    MATCHMAKING_CANCELLED,
    QUESTION_STARTED,
    ANSWER_ACCEPTED,
    SCOREBOARD,
    QUESTION_REVEALED,
    MATCH_ENDED,
    SNAPSHOT,
    REMATCH_REQUESTED,
    REMATCH_ACCEPTED,
    REMATCH_DECLINED,
    REMATCH_EXPIRED,
    ROOM_JOINED,
    ROOM_LOBBY_UPDATED,
    ROOM_CLOSED,
    ROOM_START_FAILED,
    ROOM_MATCH_STARTED,
    ROOM_SUCCEEDED,
    /** Private: a request was refused ({@link ErrorPayload}). */
    ERROR
}
