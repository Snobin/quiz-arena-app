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
    /** Broadcast: a question's window opened ({@link QuestionStartedPayload}). */
    QUESTION_STARTED,
    /** Private, with {@code refSeq}: the answer was received in time ({@link AnswerAcceptedPayload}). */
    ANSWER_ACCEPTED,
    /** Broadcast: who has answered the open question ({@link ScoreboardPayload}). */
    SCOREBOARD,
    /** Broadcast: the window closed; answer and results ({@link QuestionRevealedPayload}). */
    QUESTION_REVEALED,
    /** Private, no {@code seq}: a completed match's standings, questions and breakdown ({@link MatchEndedPayload}). */
    MATCH_ENDED,
    /** Private, with {@code refSeq}: the match as it stands, in reply to {@code resync} ({@link SnapshotPayload}). */
    SNAPSHOT,
    /**
     * Private, about the ended match: a human asked for a rematch; sent to both humans
     * ({@link RematchRequestedPayload}). Story 1.10.
     */
    REMATCH_REQUESTED,
    /** Unused: an accepted rematch arrives as an ordinary {@link #MATCH_FOUND} for the new match. */
    REMATCH_ACCEPTED,
    /** Private, about the ended match: the receiver's rematch state reverts ({@link RematchDeclinedPayload}). */
    REMATCH_DECLINED,
    /** Private, about the ended match: a pending request lapsed; sent to both humans ({@link RematchExpiredPayload}). */
    REMATCH_EXPIRED,
    ROOM_JOINED,
    ROOM_LOBBY_UPDATED,
    ROOM_CLOSED,
    ROOM_START_FAILED,
    ROOM_MATCH_STARTED,
    ROOM_SUCCEEDED,
    /** Private: a request was refused ({@link ErrorPayload}). */
    ERROR,
    /** Broadcast: a participant left the match ({@link ParticipantForfeitedPayload}). */
    PARTICIPANT_FORFEITED,
    /** Broadcast: the match ended without results ({@link MatchAbortedPayload}). */
    MATCH_ABORTED
}
