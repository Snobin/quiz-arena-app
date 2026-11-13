package in.minnal.contracts.realtime;

/** Why a rematch request was reverted ({@link RematchDeclinedPayload}). */
public enum RematchDeclineReason {
    /** The requester cancelled her request (sent to the opponent). */
    CANCELLED,
    /**
     * The rematch cannot happen: no open window for that match, the sender was not one of its
     * humans, or one of the two left, is queued or is in another match (sent to whoever must revert).
     */
    UNAVAILABLE
}
