package in.minnal.core.solo.application;

import java.util.Optional;
import java.util.UUID;

/** Where Solo Practice sessions live: Valkey only (Story 4.3), with a 2 h sliding TTL. */
public interface SoloSessionStore {

    /**
     * A stored session with its revision: a counter the store bumps on every successful replace. Compare-and-set compares
     * the revision, never the serialised session, so changing the {@link SoloSession} record cannot break live sessions.
     */
    record Versioned(SoloSession session, long revision) {
    }

    /** Stores a new session as the player's one active session and deletes any earlier one, as one atomic step. */
    void create(SoloSession session);

    /** The session and its revision, refreshing its TTL; empty when it never existed or has expired. */
    Optional<Versioned> find(UUID sessionId);

    /** Replaces the session with {@code next} only if its revision is still {@code expected}'s. */
    boolean replace(Versioned expected, SoloSession next);

    /** Deletes the session and the player's pointer to it. */
    void delete(SoloSession session);
}
