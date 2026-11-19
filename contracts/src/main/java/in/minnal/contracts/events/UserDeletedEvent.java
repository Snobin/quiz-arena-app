package in.minnal.contracts.events;

import java.time.Instant;
import java.util.UUID;

/**
 * {@code minnal.user.deleted} (AD-15): written by core to its outbox in the transaction that marks the
 * account deleted, relayed with one stream field, {@code payload}, holding this record as JSON.
 * Consumers (ratings, game) are idempotent and never undo it.
 *
 * @param eventId    random, for idempotent consumers
 * @param userId     the deleted player
 * @param occurredAt when the account was deleted
 */
public record UserDeletedEvent(UUID eventId, UUID userId, Instant occurredAt) {

    /** The stream key: shared across services, so it has no service prefix. */
    public static final String STREAM = "minnal.user.deleted";

    /** The one field of each stream entry; its value is the event as JSON. */
    public static final String PAYLOAD_FIELD = "payload";
}
