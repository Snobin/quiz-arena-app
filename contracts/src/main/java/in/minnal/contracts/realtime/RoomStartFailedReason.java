package in.minnal.contracts.realtime;

/** Why a host's start did not go ahead ({@link RoomStartFailedPayload}). */
public enum RoomStartFailedReason {
    /** core answered 422, or the set was short: the topic has too few questions right now. */
    TOPIC_UNAVAILABLE,
    /** core answered 404: a custom topic that no longer exists, or that the host does not own (Story 6.5a). */
    SOURCE_UNAVAILABLE,
    /** The fetch timed out or failed: try again. */
    UNAVAILABLE
}
