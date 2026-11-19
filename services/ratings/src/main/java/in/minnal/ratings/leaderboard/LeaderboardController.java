package in.minnal.ratings.leaderboard;

import in.minnal.contracts.identity.Role;
import in.minnal.ratings.leaderboard.PeriodKeys.Period;
import in.minnal.ratings.platform.infrastructure.security.MinnalPrincipal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * {@code GET /api/ratings/v1/leaderboards/{mode}/{daily|weekly|alltime}} (FR60, FR61): the board for the current
 * period, readable by any valid token (a guest sees the boards, never a {@code me}). Only the top 100 positions are
 * listed, at most 50 per request; rank is standard competition ranking (one plus the count of strictly higher values);
 * names and districts come from the player directory. Everything is read from Valkey, never recomputed here.
 */
@RestController
@RequestMapping("/api/ratings/v1/leaderboards")
class LeaderboardController {

    static final int TOP = 100;
    static final int MAX_LIMIT = 50;
    static final List<String> MODES = List.of("QUICK", "TOPIC_DUEL", "BATTLE_ROOM");

    private final LeaderboardStore store;
    private final Boards boards;
    private final JdbcClient jdbc;
    private final Clock clock;

    LeaderboardController(LeaderboardStore store, Boards boards, JdbcClient jdbc, Clock clock) {
        this.store = store;
        this.boards = boards;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @GetMapping("/{mode}/{period}")
    ResponseEntity<Map<String, Object>> board(@AuthenticationPrincipal MinnalPrincipal principal, @PathVariable String mode,
                                              @PathVariable String period, @RequestParam(name = "offset", defaultValue = "0") int offset,
                                              @RequestParam(name = "limit", defaultValue = "50") int limit) {
        if (!MODES.contains(mode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown mode.");
        }
        Period parsed = Period.parse(period).orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown period."));
        if (offset < 0 || limit < 1 || limit > MAX_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "offset must be 0 or more and limit between 1 and " + MAX_LIMIT + ".");
        }
        var now = clock.instant();
        String key = boards.key(mode, parsed, now);
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(read(principal, mode, parsed, key, now, offset, limit));
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RuntimeException e) {
            // Valkey unreachable or erroring: the boards are temporarily unavailable, not a server bug.
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Leaderboards are unavailable right now.", e);
        }
    }

    private Map<String, Object> read(MinnalPrincipal principal, String mode, Period parsed, String key, java.time.Instant now, int offset, int limit) {
        // Only the top 100 positions are listed.
        int visible = Math.max(0, Math.min(limit, TOP - offset));
        List<LeaderboardStore.Row> rows = visible == 0 ? List.of() : store.top(key, offset, visible);
        Map<UUID, Person> directory = directory(rows);

        List<Map<String, Object>> entries = new ArrayList<>();
        long previousRank = 0;
        double previousScore = Double.NaN;
        for (int i = 0; i < rows.size(); i++) {
            LeaderboardStore.Row row = rows.get(i);
            // Competition ranking from the page itself: a tie shares the rank above; otherwise the rank is the position.
            // Only the page's first row needs a count (its position depends on the rows before the page).
            long rank = i > 0 && row.score() == previousScore ? previousRank : (i == 0 ? 1 + store.countHigher(key, row.score()) : offset + i + 1L);
            previousRank = rank;
            previousScore = row.score();
            UUID member;
            try {
                member = UUID.fromString(row.member());
            } catch (IllegalArgumentException notAUser) {
                continue; // never expected: boards hold user ids only
            }
            Person person = directory.getOrDefault(member, new Person("", "", false));
            if (person.tombstoned()) {
                continue; // a deleted account is not shown (its entry goes at the next rebuild)
            }
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("rank", rank);
            entry.put("userId", row.member());
            entry.put("displayName", person.name());
            entry.put("district", person.district());
            entry.put("value", (int) row.score());
            entries.add(entry);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mode", mode);
        body.put("period", parsed.id());
        body.put("periodKey", PeriodKeys.key(parsed, now));
        body.put("measure", parsed == Period.ALLTIME ? "RATING" : "RATING_GAINED");
        body.put("entries", entries);
        if (principal != null && (principal.hasRole(Role.USER) || principal.hasRole(Role.ADMIN))) {
            // Present for a registered caller (null when she has no position); absent for a guest.
            body.put("me", me(key, principal.sub()));
        }
        return body;
    }

    private Map<String, Object> me(String key, String sub) {
        String member;
        try {
            member = UUID.fromString(sub).toString();
        } catch (IllegalArgumentException e) {
            return null;
        }
        return store.score(key, member).map(score -> {
            Map<String, Object> me = new LinkedHashMap<>();
            me.put("rank", 1 + store.countHigher(key, score));
            me.put("value", score.intValue());
            return me;
        }).orElse(null);
    }

    /** A player's directory row; {@code tombstoned} players are never listed. */
    private record Person(String name, String district, boolean tombstoned) {
    }

    private Map<UUID, Person> directory(List<LeaderboardStore.Row> rows) {
        if (rows.isEmpty()) {
            return Map.of();
        }
        List<UUID> ids = new ArrayList<>();
        for (LeaderboardStore.Row row : rows) {
            try {
                ids.add(UUID.fromString(row.member()));
            } catch (IllegalArgumentException ignored) {
                // skipped again when the entry is built
            }
        }
        Map<UUID, Person> out = new LinkedHashMap<>();
        jdbc.sql("SELECT user_id, display_name, district, tombstoned_at IS NOT NULL AS gone FROM player_directory WHERE user_id = ANY(:ids)")
                .param("ids", ids.toArray(UUID[]::new))
                .query((rs, n) -> out.put(rs.getObject("user_id", UUID.class),
                        new Person(rs.getString("display_name"), rs.getString("district"), rs.getBoolean("gone"))))
                .list();
        return out;
    }
}
