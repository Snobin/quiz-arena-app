package in.minnal.game.matchmaking.domain;

import in.minnal.contracts.realtime.ParticipantKind;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

/**
 * A human waiting for an opponent.
 *
 * @param sub         the player's identity (JWT {@code sub})
 * @param displayName from the token, shown as is
 * @param kind        {@code USER} or {@code GUEST}
 * @param rating      from game-service's rating cache, never from the client
 * @param joinedAt    when the actor took the join
 */
public record Seeker(String sub, String displayName, ParticipantKind kind, int rating, Instant joinedAt) {

    public Seeker {
        Objects.requireNonNull(sub);
        Objects.requireNonNull(kind);
        Objects.requireNonNull(joinedAt);
        if (kind == ParticipantKind.BOT) {
            throw new IllegalArgumentException("a seeker is human");
        }
    }

    public Duration waitedAt(Instant now) {
        return Duration.between(joinedAt, now);
    }
}
