package in.minnal.contracts.events;

/**
 * {@code minnal.rating.updated} (AD-13, AD-16): written by ratings through its outbox when a rated match changes a rating,
 * read by game (no consumer group) to keep its in-memory rating cache current. Only the stream key is shared here; the
 * payload is ratings' own outbox JSON, which game reads with its own tolerant reader.
 */
public final class RatingUpdatedStream {

    /** The stream key: shared across services, so it has no service prefix. */
    public static final String STREAM = "minnal.rating.updated";

    private RatingUpdatedStream() {
    }
}
