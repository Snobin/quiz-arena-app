package in.minnal.game.match.application;

import in.minnal.game.match.domain.MatchShell;
import in.minnal.game.platform.session.Activity;
import in.minnal.game.platform.session.LastSessionClosed;
import in.minnal.game.platform.session.ParticipationRegistry;
import in.minnal.game.platform.session.PlayerSessions;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The live match shells. Creating one moves its humans to {@code IN_MATCH}.
 *
 * <p>Until Story 1.7 gives matches a lifecycle, a shell would otherwise hold its humans forever, so
 * it is discarded (and its humans released) once every human's last session has closed, or
 * {@code minnal.match.shell-ttl} (5 min) after creation, whichever comes first.
 */
@Component
public class MatchRegistry implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(MatchRegistry.class);

    private final ConcurrentHashMap<UUID, MatchShell> shells = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, ScheduledFuture<?>> expiries = new ConcurrentHashMap<>();
    private final ParticipationRegistry participation;
    private final PlayerSessions sessions;
    private final Duration ttl;
    private final ScheduledThreadPoolExecutor expiry = expiryExecutor();

    public MatchRegistry(ParticipationRegistry participation, PlayerSessions sessions,
            @Value("${minnal.match.shell-ttl:5m}") Duration ttl) {
        this.participation = participation;
        this.sessions = sessions;
        this.ttl = ttl;
    }

    /** Registers {@code shell}, moves its humans to {@code IN_MATCH} and arms its expiry. */
    public MatchShell create(MatchShell shell) {
        shells.put(shell.matchId(), shell);
        for (String sub : shell.humans().keySet()) {
            participation.replace(sub, new Activity.InMatch(shell.matchId()));
        }
        // The task holds only the id, so a discarded shell (answers included) is not kept reachable.
        UUID matchId = shell.matchId();
        expiries.put(matchId, expiry.schedule(() -> discard(matchId, "expired"), ttl.toMillis(), TimeUnit.MILLISECONDS));
        // Every human may already be gone (disconnected while the set was being fetched).
        releaseIfAbandoned(shell);
        return shell;
    }

    public Optional<MatchShell> find(UUID matchId) {
        return Optional.ofNullable(shells.get(matchId));
    }

    public int size() {
        return shells.size();
    }

    /** Scheduled expiries still waiting (tests). */
    int pendingExpiries() {
        return expiry.getQueue().size();
    }

    @EventListener
    void onLastSessionClosed(LastSessionClosed event) {
        participation.matchOf(event.sub()).flatMap(this::find).ifPresent(this::releaseIfAbandoned);
    }

    private void releaseIfAbandoned(MatchShell shell) {
        if (shell.humans().keySet().stream().noneMatch(sessions::hasSession)) {
            discard(shell.matchId(), "abandoned");
        }
    }

    /** Removes the shell (once) and frees its humans that are still in it. */
    void discard(UUID matchId, String why) {
        MatchShell shell = shells.remove(matchId);
        ScheduledFuture<?> pending = expiries.remove(matchId);
        if (pending != null) {
            pending.cancel(false);
        }
        if (shell == null) {
            return;
        }
        for (Map.Entry<String, UUID> human : shell.humans().entrySet()) {
            participation.release(human.getKey(), new Activity.InMatch(matchId));
        }
        log.atInfo().addKeyValue("matchId", matchId).log("match shell discarded ({})", why);
    }

    private static ScheduledThreadPoolExecutor expiryExecutor() {
        ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(1,
                Thread.ofPlatform().name("match-shell-expiry").daemon(true).factory());
        executor.setRemoveOnCancelPolicy(true); // a cancelled expiry leaves the queue at once
        return executor;
    }

    @Override
    public void destroy() {
        expiry.shutdownNow();
    }
}
