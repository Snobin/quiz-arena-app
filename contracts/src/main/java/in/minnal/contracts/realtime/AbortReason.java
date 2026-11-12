package in.minnal.contracts.realtime;

/** Why a match was aborted ({@link MatchAbortedPayload}). */
public enum AbortReason {
    /** Every human left before the first question was revealed. */
    ALL_LEFT,
    /** The match ended on a server error. */
    ERROR
}
