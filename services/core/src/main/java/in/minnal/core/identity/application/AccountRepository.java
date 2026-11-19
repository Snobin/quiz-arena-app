package in.minnal.core.identity.application;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface AccountRepository {

    /** The ACTIVE account for this external identity, with {@code last_sign_in_at} set to {@code at}. */
    Optional<Account> resumeByIdentity(String provider, String subject, ExternalIdentity latest, Instant at);

    /** Creates the user and identity rows; throws DuplicateKeyException if the identity already exists. */
    Account create(ExternalIdentity identity, Instant at);

    /** An ACTIVE account by id. */
    Optional<Account> findActive(UUID id);
}
