package in.minnal.contracts.realtime;

/** Why a host's start did not go ahead ({@link RoomStartFailedPayload}). */
public enum RoomStartFailedReason {
    /** core answered 422, or the set was short: the topic has too few questions right now. */
    TOPIC_UNAVAILABLE,
    /** The fetch timed out or failed: try again. */
    UNAVAILABLE
}
