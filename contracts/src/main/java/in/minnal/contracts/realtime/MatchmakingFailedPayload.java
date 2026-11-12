package in.minnal.contracts.realtime;

/**
 * {@code MATCHMAKING_FAILED}: the pairing could not start; the player is idle again (not re-queued).
 *
 * @param reason a machine-readable reason, e.g. {@link #QUESTION_SET_UNAVAILABLE}
 */
public record MatchmakingFailedPayload(String reason) {

    /** core-service did not return the question set in time, or refused it (4xx/5xx). */
    public static final String QUESTION_SET_UNAVAILABLE = "QUESTION_SET_UNAVAILABLE";
}
