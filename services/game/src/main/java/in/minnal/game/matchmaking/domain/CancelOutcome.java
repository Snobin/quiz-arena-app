package in.minnal.game.matchmaking.domain;

/** What a cancel did. */
public enum CancelOutcome {
    /** Removed from the waiting queue. */
    CANCELLED,
    /** Already paired (the question set is being fetched): the pairing goes ahead. */
    REJECTED_PAIRED,
    /** Neither waiting nor pairing in this queue. */
    NOT_QUEUED
}
