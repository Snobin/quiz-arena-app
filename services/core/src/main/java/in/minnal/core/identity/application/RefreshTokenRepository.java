package in.minnal.core.identity.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository {

    void save(UUID id, UUID userId, String tokenHash, Instant expiresAt, Instant createdAt);

    /** The owner of an unexpired token with this hash. */
    Optional<UUID> findUserId(String tokenHash, Instant now);
}
