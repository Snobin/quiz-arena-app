package in.minnal.contracts.events;

import in.minnal.contracts.internal.QuestionSource;
import in.minnal.contracts.realtime.MatchMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * {@code minnal.match.completed} (AD-8): published by game-service exactly once per completed match
 * (Q1 was revealed), after its final reveal; never for an aborted or failed match. Each stream entry
 * has one field, {@link #PAYLOAD_FIELD}, holding this record as JSON. Consumers deduplicate by
 * {@code eventId} (NFR8).
 *
 * @param eventId        random, for idempotent consumers
 * @param roomId         the Battle Room, or null (omitted) outside rooms
 * @param rated          {@code questionSource == BANK}
 * @param startedAt      when Q1 opened
 * @param endedAt        when the match ended
 * @param queueWaitMs    the longest human queue wait, or null (omitted) when none is known
 * @param participants   every participant, in participant order
 */
public record MatchCompletedEvent(
        UUID eventId,
        UUID matchId,
        MatchMode mode,
        UUID roomId,
        QuestionSource questionSource,
        boolean rated,
        Instant startedAt,
        Instant endedAt,
        Long queueWaitMs,
        List<CompletedParticipant> participants) {

    /** The stream key: shared across services, so it has no service prefix. */
    public static final String STREAM = "minnal.match.completed";

    /** The one field of each stream entry; its value is the event as JSON. */
    public static final String PAYLOAD_FIELD = "payload";

    public MatchCompletedEvent {
        participants = List.copyOf(participants);
    }

    /** A new event with a random {@code eventId} and {@code rated} derived from the source. */
    public static MatchCompletedEvent of(UUID matchId, MatchMode mode, UUID roomId, QuestionSource questionSource,
            Instant startedAt, Instant endedAt, Long queueWaitMs, List<CompletedParticipant> participants) {
        return new MatchCompletedEvent(UUID.randomUUID(), matchId, mode, roomId, questionSource,
                questionSource == QuestionSource.BANK, startedAt, endedAt, queueWaitMs, participants);
    }
}
