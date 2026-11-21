package in.minnal.game.matchmaking.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * The state of one matchmaking queue (AD-13): pure, clock-driven and single-threaded (it lives
 * inside the queue actor), so the timing rules are tested deterministically without threads.
 *
 * <p>Pairing rule, applied by {@link #pair}: candidates are taken oldest first; a waiting player's
 * band is ±200, or ±400 once she has waited 4 s; two humans pair when their rating difference is
 * within the band of the longer-waiting one, and among several candidates the closest rating wins
 * (ties go to the earliest join). Whoever is still unpaired after 8 s gets a bot.
 *
 * <p>A pairing leaves the waiting list at once and stays "pairing" until {@link #complete} (the
 * question set arrived or failed); a cancel in that state is rejected.
 */
public final class MatchmakingQueue {

    private final MatchmakingRules rules;
    private final Supplier<UUID> ids;
    /** Waiting players, oldest join first (ties keep join order). */
    private final List<Seeker> waiting = new ArrayList<>();
    private final Map<UUID, Pairing> pairings = new LinkedHashMap<>();
    private final Map<String, UUID> pairingBySub = new HashMap<>();

    public MatchmakingQueue(MatchmakingRules rules, Supplier<UUID> ids) {
        this.rules = rules;
        this.ids = ids;
    }

    public MatchmakingQueue(MatchmakingRules rules) {
        this(rules, UUID::randomUUID);
    }

    /** Adds {@code seeker}; false (and nothing changes) if the sub is already waiting or pairing. */
    public boolean join(Seeker seeker) {
        if (contains(seeker.sub())) {
            return false;
        }
        int at = waiting.size();
        while (at > 0 && waiting.get(at - 1).joinedAt().isAfter(seeker.joinedAt())) {
            at--;
        }
        waiting.add(at, seeker);
        return true;
    }

    /** Forms every pairing due at {@code now}: humans first, then bots for whoever waited long enough. */
    public List<Pairing> pair(Instant now) {
        List<Pairing> formed = new ArrayList<>();
        int i = 0;
        while (i < waiting.size()) {
            Seeker oldest = waiting.get(i);
            int band = rules.bandAfter(oldest.waitedAt(now));
            Seeker best = null;
            int bestDiff = Integer.MAX_VALUE;
            for (int j = i + 1; j < waiting.size(); j++) {
                Seeker candidate = waiting.get(j);
                int diff = Math.abs(oldest.rating() - candidate.rating());
                if (diff <= band && diff < bestDiff) {
                    best = candidate;
                    bestDiff = diff;
                }
            }
            if (best == null) {
                i++;
                continue;
            }
            waiting.remove(best);
            waiting.remove(i);
            formed.add(register(new Pairing(ids.get(), oldest, best, now)));
        }
        for (Seeker seeker : List.copyOf(waiting)) {
            if (rules.botDue(seeker.waitedAt(now))) {
                waiting.remove(seeker);
                formed.add(register(new Pairing(ids.get(), seeker, null, now)));
            }
        }
        return formed;
    }

    private Pairing register(Pairing pairing) {
        pairings.put(pairing.id(), pairing);
        for (Seeker human : pairing.humans()) {
            pairingBySub.put(human.sub(), pairing.id());
        }
        return pairing;
    }

    public CancelOutcome cancel(String sub) {
        if (pairingBySub.containsKey(sub)) {
            return CancelOutcome.REJECTED_PAIRED;
        }
        return waiting.removeIf(s -> s.sub().equals(sub)) ? CancelOutcome.CANCELLED : CancelOutcome.NOT_QUEUED;
    }

    /** The player's last session closed: drop her if she is still waiting. A pairing goes ahead. */
    public boolean leave(String sub) {
        return waiting.removeIf(s -> s.sub().equals(sub));
    }

    /** Ends the pairing state of {@code pairingId} (its set arrived or failed). */
    public Optional<Pairing> complete(UUID pairingId) {
        Pairing pairing = pairings.remove(pairingId);
        if (pairing != null) {
            for (Seeker human : pairing.humans()) {
                pairingBySub.remove(human.sub());
            }
        }
        return Optional.ofNullable(pairing);
    }

    /** Nobody waiting and no pairing awaiting its question set. */
    public boolean isEmpty() {
        return waiting.isEmpty() && pairings.isEmpty();
    }

    public boolean contains(String sub) {
        return pairingBySub.containsKey(sub) || waiting.stream().anyMatch(s -> s.sub().equals(sub));
    }

    public boolean isWaiting(String sub) {
        return waiting.stream().anyMatch(s -> s.sub().equals(sub));
    }

    public boolean isPairing(String sub) {
        return pairingBySub.containsKey(sub);
    }

    public List<Seeker> waiting() {
        return List.copyOf(waiting);
    }

    public Collection<Pairing> pairings() {
        return List.copyOf(pairings.values());
    }
}
