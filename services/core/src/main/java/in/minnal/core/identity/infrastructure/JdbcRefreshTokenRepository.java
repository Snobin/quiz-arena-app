package in.minnal.core.identity.infrastructure;

import in.minnal.core.identity.application.RefreshTokenRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcRefreshTokenRepository implements RefreshTokenRepository {

    private final JdbcClient jdbc;

    JdbcRefreshTokenRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void save(UUID id, UUID userId, String tokenHash, Instant expiresAt, Instant createdAt) {
        jdbc.sql("INSERT INTO refresh_token (id, user_id, token_hash, expires_at, created_at) VALUES (:id, :user, :hash, :exp, :at)")
                .param("id", id).param("user", userId).param("hash", tokenHash)
                .param("exp", Timestamp.from(expiresAt)).param("at", Timestamp.from(createdAt)).update();
    }

    @Override
    public Optional<UUID> findUserId(String tokenHash, Instant now) {
        return jdbc.sql("SELECT user_id FROM refresh_token WHERE token_hash = :hash AND expires_at > :now")
                .param("hash", tokenHash).param("now", Timestamp.from(now)).query(UUID.class).optional();
    }
}
