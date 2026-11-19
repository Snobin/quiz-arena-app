package in.minnal.game.platform.infrastructure.valkey;

import java.util.List;

/** Reads {@code minnal.rating.updated} entries in order, starting after a stream id; a plain read, no consumer group. */
public interface RatingUpdateSource {

    /** The entries' JSON payloads and the id of the last one read ({@code afterId} again when there were none). */
    record Batch(String lastId, List<String> payloads) {
    }

    /** Waits up to a short time for entries after {@code afterId}. */
    Batch read(String afterId);
}
