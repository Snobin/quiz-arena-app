package in.minnal.ratings.rating.api;

import in.minnal.contracts.identity.Role;
import in.minnal.ratings.platform.infrastructure.security.MinnalPrincipal;
import in.minnal.ratings.rating.api.RatingsViews.MatchResult;
import in.minnal.ratings.rating.api.RatingsViews.MyMatches;
import in.minnal.ratings.rating.api.RatingsViews.MyRatings;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The signed-in player's own ratings and matches (FR7, FR8). USER or ADMIN tokens only (a guest gets 403, no token
 * 401); every query is keyed by the token's {@code sub}, and no path or parameter names another user. A match the
 * caller has no record of (not processed yet, or not hers) is a 404.
 */
@RestController
@RequestMapping("/api/ratings/v1")
class RatingsController {

    static final int MAX_HISTORY = 20;

    private final RatingsReadRepository repository;

    RatingsController(RatingsReadRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/matches/{matchId}")
    ResponseEntity<MatchResult> match(@AuthenticationPrincipal MinnalPrincipal principal, @PathVariable UUID matchId) {
        UUID user = registered(principal);
        MatchResult result = repository.matchResult(user, matchId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No result for this match yet."));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @GetMapping("/me/ratings")
    ResponseEntity<MyRatings> ratings(@AuthenticationPrincipal MinnalPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new MyRatings(repository.ratings(registered(principal))));
    }

    @GetMapping("/me/matches")
    ResponseEntity<MyMatches> matches(@AuthenticationPrincipal MinnalPrincipal principal,
                                      @RequestParam(name = "limit", defaultValue = "20") int limit) {
        UUID user = registered(principal);
        if (limit < 1 || limit > MAX_HISTORY) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and " + MAX_HISTORY + ".");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new MyMatches(repository.matches(user, limit)));
    }

    private static UUID registered(MinnalPrincipal principal) {
        if (principal == null || !(principal.hasRole(Role.USER) || principal.hasRole(Role.ADMIN))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sign in with an account to see your ratings.");
        }
        try {
            return UUID.fromString(principal.sub());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Sign in with an account to see your ratings.");
        }
    }
}
