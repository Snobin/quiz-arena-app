package in.minnal.contracts.realtime;

/** Why a Battle Room closed ({@link RoomClosedPayload}). */
public enum RoomClosedReason {
    /** The host left the lobby. */
    HOST_LEFT,
    /** The host's last session dropped and her reconnect grace ran out. */
    HOST_DISCONNECTED,
    /** The room reached its {@code expiresAt} (24 h after creation). */
    EXPIRED,
    /** game-service is shutting down; the host can create the room again. */
    SERVER_DRAINING
}
