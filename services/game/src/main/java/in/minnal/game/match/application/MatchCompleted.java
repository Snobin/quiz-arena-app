package in.minnal.game.match.application;

import in.minnal.game.match.domain.MatchSetup;

/** A match completed (not aborted, not failed): published once for the product metrics (Story 7.3b). */
public record MatchCompleted(MatchSetup setup) {
}
