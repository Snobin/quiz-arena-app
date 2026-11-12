package in.minnal.game.platform.session;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * One activity per {@code sub}, across all of its sessions (AD-11): the narrowest shared state
 * between the matchmaking actors and the match shells. Every change is a single atomic map
 * operation, so two joins racing from two tabs can never both claim.
 */
@Component
public class ParticipationRegistry {

    private final ConcurrentHashMap<String, Activity> activities = new ConcurrentHashMap<>();

    /**
     * Claims {@code activity} for {@code sub} if it has none.
     *
     * @return empty when claimed, else the activity already held (nothing changed)
     */
    public Optional<Activity> claim(String sub, Activity activity) {
        Activity[] existing = new Activity[1];
        activities.compute(sub, (key, current) -> {
            existing[0] = current;
            return current != null ? current : activity;
        });
        return Optional.ofNullable(existing[0]);
    }

    /** Replaces whatever {@code sub} holds (a queue claim moving into its match). */
    public void replace(String sub, Activity activity) {
        activities.put(sub, activity);
    }

    /** Releases {@code sub} only if it still holds {@code expected}; returns whether it did. */
    public boolean release(String sub, Activity expected) {
        return activities.remove(sub, expected);
    }

    public Optional<Activity> activityOf(String sub) {
        return Optional.ofNullable(activities.get(sub));
    }

    /** The active match of {@code sub}, if it is in one. */
    public Optional<UUID> matchOf(String sub) {
        return activityOf(sub).filter(Activity.InMatch.class::isInstance).map(a -> ((Activity.InMatch) a).matchId());
    }
}
