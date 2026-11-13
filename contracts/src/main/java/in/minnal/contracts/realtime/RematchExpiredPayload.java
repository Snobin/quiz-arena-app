package in.minnal.contracts.realtime;

/**
 * {@code REMATCH_EXPIRED} (private, about the ended match; Story 1.10): a pending request reached its
 * deadline unanswered. Sent to both humans. It has no fields (serialised as {@code {}}).
 */
public record RematchExpiredPayload() {
}
