package in.minnal.core.profile.application;

import in.minnal.contracts.events.UserDeletedEvent;
import in.minnal.core.identity.application.AccountRepository;
import in.minnal.core.identity.application.RefreshTokenRepository;
import in.minnal.core.question.infrastructure.JdbcTopicCatalogueRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

/**
 * Account deletion (Story 2.8) in one transaction: the user is marked DELETED, every refresh token is
 * revoked, the identity link is removed, the user's recent topics (Story 4.1) are deleted and
 * {@code minnal.user.deleted} goes to the outbox. Which other personal data must be erased (DPDP) is an
 * open question for Story 7.4; nothing else is erased here.
 */
@Service
public class AccountDeletionService {

    private final AccountRepository accounts;
    private final RefreshTokenRepository tokens;
    private final OutboxRepository outbox;
    private final JdbcTopicCatalogueRepository recentTopics;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final JsonMapper json;

    public AccountDeletionService(AccountRepository accounts, RefreshTokenRepository tokens, OutboxRepository outbox,
                                  JdbcTopicCatalogueRepository recentTopics,
                                  TransactionTemplate tx, Clock clock, JsonMapper json) {
        this.accounts = accounts;
        this.tokens = tokens;
        this.outbox = outbox;
        this.recentTopics = recentTopics;
        this.tx = tx;
        this.clock = clock;
        this.json = json;
    }

    /** Deletes the account; a no-op (no second event) when it is already gone. */
    public void delete(UUID userId) {
        Instant now = clock.instant();
        tx.executeWithoutResult(status -> {
            if (!accounts.markDeleted(userId)) {
                return;
            }
            tokens.revokeAllForUser(userId, now);
            recentTopics.deleteForUser(userId);
            outbox.add(UserDeletedEvent.STREAM, json.writeValueAsString(new UserDeletedEvent(UUID.randomUUID(), userId, now)), now);
        });
    }
}
