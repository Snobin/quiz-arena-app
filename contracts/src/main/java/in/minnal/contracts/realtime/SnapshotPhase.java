package in.minnal.contracts.realtime;

/** Where a match stands when a {@link SnapshotPayload} is taken (Story 1.9). */
public enum SnapshotPhase {
    /** Before the first question opens. */
    LEAD_IN,
    /** A question's window is open. */
    QUESTION_OPEN,
    /** Between a question's close and the next one's start (the reveal hold). */
    REVEAL,
    /** The match has ended. */
    ENDED
}
