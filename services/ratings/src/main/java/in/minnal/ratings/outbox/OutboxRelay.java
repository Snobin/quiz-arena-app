package in.minnal.ratings.outbox;

import in.minnal.ratings.ingest.StreamClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Publishes outbox rows to Valkey streams, oldest first (commit order for a single writer), with
 * {@code MAXLEN ~ 100000} (AD-15). A row is marked published only after the publish succeeded. On failure the
 * relay backs off (2^attempts s, at most 30 s) with the same row still first in line, so order is kept.
 */
public class OutboxRelay {

    static final Duration MAX_BACKOFF = Duration.ofSeconds(30);
    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxRepository outbox;
    private final StreamClient streams;
    private final Clock clock;
    private Instant notBefore = Instant.MIN;

    public OutboxRelay(OutboxRepository outbox, StreamClient streams, Clock clock) {
        this.outbox = outbox;
        this.streams = streams;
        this.clock = clock;
    }

    /** Publishes what is due; returns how many events were delivered. */
    public synchronized int publishPending() {
        int delivered = 0;
        while (!clock.instant().isBefore(notBefore)) {
            Optional<OutboxRepository.Entry> next = outbox.oldestUnpublished();
            if (next.isEmpty()) {
                break;
            }
            OutboxRepository.Entry entry = next.get();
            try {
                streams.addCapped(entry.stream(), entry.payload());
                outbox.markPublished(entry.id(), clock.instant());
                delivered++;
            } catch (RuntimeException e) {
                Duration backoff = backoff(entry.attempts() + 1);
                notBefore = clock.instant().plus(backoff);
                log.warn("outbox publish failed (attempt {}), retrying in {}: {}", entry.attempts() + 1, backoff, e.toString());
                try {
                    outbox.recordFailure(entry.id());
                } catch (RuntimeException recordFailed) {
                    log.warn("could not record the outbox failure: {}", recordFailed.toString());
                }
                break;
            }
        }
        return delivered;
    }

    static Duration backoff(int attempts) {
        long seconds = attempts >= 5 ? MAX_BACKOFF.toSeconds() : 1L << attempts;
        return Duration.ofSeconds(Math.min(seconds, MAX_BACKOFF.toSeconds()));
    }
}
