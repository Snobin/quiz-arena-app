package in.minnal.core.solo.application;

import java.util.Optional;
import java.util.UUID;

/** Where Solo Practice sessions live: Valkey only (Story 4.3), with a 2 h sliding TTL. */
public interface SoloSessionStore {

    /** Stores a new session as the player's one active session, deleting any earlier one. */
    void create(SoloSession session);

    /** The session, refreshing its TTL; empty when it never existed or has expired. */
    Optional<SoloSession> find(UUID sessionId);

    /** Replaces {@code expected} with {@code next} only if the stored value is still exactly {@code expected}. */
    boolean replace(SoloSession expected, SoloSession next);

    /** Deletes the session and the player's pointer to it. */
    void delete(SoloSession session);
}
