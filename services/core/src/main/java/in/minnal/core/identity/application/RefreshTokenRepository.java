package in.minnal.core.identity.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository {

    /** A stored refresh token row (never the raw token). */
    record Stored(UUID id, UUID userId, UUID familyId, Instant expiresAt, Instant rotatedAt, Instant revokedAt) {
    }

    void save(UUID id, UUID userId, UUID familyId, String tokenHash, Instant expiresAt, Instant createdAt);

    /** The token with this hash, row-locked until the surrounding transaction ends. */
    Optional<Stored> lockByHash(String tokenHash);

    void markRotated(UUID id, Instant at);

    /** Revokes every not-yet-revoked token of the family. */
    void revokeFamily(UUID familyId, Instant at);
}
