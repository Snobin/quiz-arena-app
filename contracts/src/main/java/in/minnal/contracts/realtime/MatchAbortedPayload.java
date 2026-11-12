package in.minnal.contracts.realtime;

/**
 * {@code MATCH_ABORTED} (broadcast): the match ended without results (Story 1.9). Nothing is
 * published for it.
 */
public record MatchAbortedPayload(AbortReason reason) {
}
