package in.minnal.core.identity.application;

import java.time.Clock;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Creates the account on first sign-in and resumes it afterwards, one account per (provider, subject). */
@Service
public class AccountService {

    private final AccountRepository accounts;
    private final TransactionTemplate tx;
    private final Clock clock;

    public AccountService(AccountRepository accounts, TransactionTemplate tx, Clock clock) {
        this.accounts = accounts;
        this.tx = tx;
        this.clock = clock;
    }

    public Account signIn(ExternalIdentity identity) {
        try {
            return tx.execute(status -> accounts
                    .resumeByIdentity(identity.provider(), identity.subject(), identity, clock.instant())
                    .orElseGet(() -> accounts.create(identity, clock.instant())));
        } catch (DuplicateKeyException race) {
            // A concurrent first sign-in won the insert; its account is the one to resume.
            return tx.execute(status -> accounts
                    .resumeByIdentity(identity.provider(), identity.subject(), identity, clock.instant())
                    .orElseThrow(() -> race));
        }
    }
}
