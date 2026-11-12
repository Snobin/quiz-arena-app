package in.minnal.game.matchmaking.domain;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Two humans, or one human and a bot ({@code second == null}), taken out of the queue together.
 * The id becomes the match id once the question set arrives.
 */
public record Pairing(UUID id, Seeker first, Seeker second, Instant formedAt) {

    public Pairing {
        Objects.requireNonNull(id);
        Objects.requireNonNull(first);
        Objects.requireNonNull(formedAt);
    }

    public boolean withBot() {
        return second == null;
    }

    /** The humans, longest-waiting first. */
    public List<Seeker> humans() {
        return second == null ? List.of(first) : List.of(first, second);
    }

    /** How long {@code seeker} waited before this pairing formed, in milliseconds. */
    public long queueWaitMs(Seeker seeker) {
        return seeker.waitedAt(formedAt).toMillis();
    }

    /** The bot's rating: the human's own (AD-7, AD-13). */
    public int botRating() {
        return first.rating();
    }
}
