package in.minnal.contracts.realtime;

/**
 * {@code REMATCH_DECLINED} (private, about the ended match; Story 1.10): the receiver's rematch
 * state reverts; she may ask again.
 */
public record RematchDeclinedPayload(RematchDeclineReason reason) {
}
