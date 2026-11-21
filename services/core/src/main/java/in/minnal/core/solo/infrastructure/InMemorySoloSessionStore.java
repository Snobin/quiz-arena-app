package in.minnal.core.solo.infrastructure;

import in.minnal.core.solo.application.SoloSession;
import in.minnal.core.solo.application.SoloSessionStore;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Process-memory store for the shared integration-test context, where Valkey is excluded. Selected by {@code minnal.solo.store=memory}. */
@Component
@ConditionalOnProperty(name = "minnal.solo.store", havingValue = "memory")
public class InMemorySoloSessionStore implements SoloSessionStore {

    private final Map<UUID, SoloSession> sessions = new HashMap<>();
    private final Map<UUID, UUID> active = new HashMap<>();

    @Override
    public synchronized void create(SoloSession session) {
        UUID previous = active.put(session.userId(), session.sessionId());
        if (previous != null) {
            sessions.remove(previous);
        }
        sessions.put(session.sessionId(), session);
    }

    @Override
    public synchronized Optional<SoloSession> find(UUID sessionId) {
        return Optional.ofNullable(sessions.get(sessionId));
    }

    @Override
    public synchronized boolean replace(SoloSession expected, SoloSession next) {
        if (!expected.equals(sessions.get(expected.sessionId()))) {
            return false;
        }
        sessions.put(next.sessionId(), next);
        return true;
    }

    @Override
    public synchronized void delete(SoloSession session) {
        sessions.remove(session.sessionId());
        active.remove(session.userId(), session.sessionId());
    }

    /** Test hook: drops a session as if its TTL had run out. */
    public synchronized void expire(UUID sessionId) {
        sessions.remove(sessionId);
    }
}
