package in.minnal.game.platform.session;

import java.security.Principal;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

/**
 * Open STOMP sessions per player {@code sub} (AD-11). A player may hold several (tabs, devices);
 * only when the last one closes is {@link LastSessionClosed} published. Each new session publishes
 * {@link SessionOpened}. Disconnect events may
 * repeat for one session; they are idempotent here.
 */
@Component
public class PlayerSessions {

    private static final Logger log = LoggerFactory.getLogger(PlayerSessions.class);

    private final ConcurrentHashMap<String, Set<String>> sessionsBySub = new ConcurrentHashMap<>();
    private final ApplicationEventPublisher events;

    public PlayerSessions(ApplicationEventPublisher events) {
        this.events = events;
    }

    @EventListener
    void onConnect(SessionConnectEvent event) {
        Principal user = event.getUser();
        String sessionId = SimpMessageHeaderAccessor.getSessionId(event.getMessage().getHeaders());
        if (user != null && sessionId != null) {
            connected(user.getName(), sessionId);
        }
    }

    @EventListener
    void onDisconnect(SessionDisconnectEvent event) {
        Principal user = event.getUser();
        if (user != null) {
            disconnected(user.getName(), event.getSessionId());
        }
    }

    public void connected(String sub, String sessionId) {
        boolean[] added = new boolean[1];
        sessionsBySub.compute(sub, (key, sessions) -> {
            Set<String> next = sessions == null ? new HashSet<>() : new HashSet<>(sessions);
            added[0] = next.add(sessionId);
            return Set.copyOf(next);
        });
        if (added[0]) {
            events.publishEvent(new SessionOpened(sub));
        }
    }

    public void disconnected(String sub, String sessionId) {
        boolean[] last = new boolean[1];
        sessionsBySub.computeIfPresent(sub, (key, sessions) -> {
            if (!sessions.contains(sessionId)) {
                return sessions;
            }
            Set<String> next = new HashSet<>(sessions);
            next.remove(sessionId);
            last[0] = next.isEmpty();
            return next.isEmpty() ? null : Set.copyOf(next);
        });
        if (last[0]) {
            log.debug("last session of {} closed", sub);
            events.publishEvent(new LastSessionClosed(sub));
        }
    }

    public boolean hasSession(String sub) {
        return sessionsBySub.containsKey(sub);
    }

    public Set<String> sessionsOf(String sub) {
        return sessionsBySub.getOrDefault(sub, Set.of());
    }
}
