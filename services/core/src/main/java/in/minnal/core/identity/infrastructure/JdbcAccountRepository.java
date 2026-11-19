package in.minnal.core.identity.infrastructure;

import in.minnal.core.identity.application.Account;
import in.minnal.core.identity.application.AccountRepository;
import in.minnal.core.identity.application.ExternalIdentity;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcAccountRepository implements AccountRepository {

    private final JdbcClient jdbc;

    JdbcAccountRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Account> resumeByIdentity(String provider, String subject, ExternalIdentity latest, Instant at) {
        Optional<UUID> id = jdbc.sql("""
                SELECT u.id FROM user_identity i JOIN app_user u ON u.id = i.user_id
                WHERE i.provider = :provider AND i.provider_subject = :subject AND u.status = 'ACTIVE'
                FOR UPDATE OF u
                """).param("provider", provider).param("subject", subject).query(UUID.class).optional();
        // email is refreshed on every sign-in, and kept only while Google calls it verified.
        return id.map(userId -> {
            jdbc.sql("UPDATE app_user SET last_sign_in_at = :at, email = :email, given_name = COALESCE(:given, given_name) WHERE id = :id")
                    .param("at", Timestamp.from(at)).param("email", verifiedEmail(latest))
                    .param("given", latest.givenName()).param("id", userId).update();
            return findActive(userId).orElseThrow();
        });
    }

    @Override
    public Account create(ExternalIdentity identity, Instant at) {
        UUID id = UUID.randomUUID();
        // A racing first sign-in collides on the identity primary key; both inserts share one transaction, so the loser rolls back whole.
        jdbc.sql("INSERT INTO app_user (id, status, email, given_name, created_at, last_sign_in_at) VALUES (:id, 'ACTIVE', :email, :given, :at, :at)")
                .param("id", id).param("email", verifiedEmail(identity)).param("given", identity.givenName())
                .param("at", Timestamp.from(at)).update();
        jdbc.sql("INSERT INTO user_identity (provider, provider_subject, user_id, created_at) VALUES (:provider, :subject, :id, :at)")
                .param("provider", identity.provider()).param("subject", identity.subject()).param("id", id)
                .param("at", Timestamp.from(at)).update();
        return new Account(id, verifiedEmail(identity), identity.givenName());
    }

    @Override
    public Optional<Account> findActive(UUID id) {
        return jdbc.sql("SELECT id, email, given_name FROM app_user WHERE id = :id AND status = 'ACTIVE'")
                .param("id", id)
                .query((rs, n) -> new Account(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("given_name")))
                .optional();
    }

    private static String verifiedEmail(ExternalIdentity identity) {
        return identity.emailVerified() && identity.email() != null && !identity.email().isBlank() ? identity.email() : null;
    }
}
