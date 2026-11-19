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
    public void save(UUID id, UUID userId, UUID familyId, String tokenHash, Instant expiresAt, Instant createdAt) {
        jdbc.sql("INSERT INTO refresh_token (id, user_id, family_id, token_hash, expires_at, created_at) VALUES (:id, :user, :family, :hash, :exp, :at)")
                .param("id", id).param("user", userId).param("family", familyId).param("hash", tokenHash)
                .param("exp", Timestamp.from(expiresAt)).param("at", Timestamp.from(createdAt)).update();
    }

    @Override
    public Optional<Stored> lockByHash(String tokenHash) {
        return jdbc.sql("SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at FROM refresh_token WHERE token_hash = :hash FOR UPDATE")
                .param("hash", tokenHash)
                .query((rs, n) -> new Stored(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getObject("family_id", UUID.class), instant(rs.getTimestamp("expires_at")),
                        instant(rs.getTimestamp("rotated_at")), instant(rs.getTimestamp("revoked_at"))))
                .optional();
    }

    @Override
    public void markRotated(UUID id, Instant at) {
        jdbc.sql("UPDATE refresh_token SET rotated_at = :at WHERE id = :id").param("at", Timestamp.from(at)).param("id", id).update();
    }

    @Override
    public void revokeFamily(UUID familyId, Instant at) {
        jdbc.sql("UPDATE refresh_token SET revoked_at = :at WHERE family_id = :family AND revoked_at IS NULL")
                .param("at", Timestamp.from(at)).param("family", familyId).update();
    }

    @Override
    public void revokeAllForUser(UUID userId, Instant at) {
        jdbc.sql("UPDATE refresh_token SET revoked_at = :at WHERE user_id = :user AND revoked_at IS NULL")
                .param("at", Timestamp.from(at)).param("user", userId).update();
    }

    @Override
    public Optional<UUID> familyOf(String tokenHash) {
        return jdbc.sql("SELECT family_id FROM refresh_token WHERE token_hash = :hash").param("hash", tokenHash)
                .query(UUID.class).optional();
    }

    private static Instant instant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
