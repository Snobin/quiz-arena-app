package in.minnal.core.identity.application;

import java.util.UUID;

/** A registered player as the token issuer sees them. {@code email} is set only when it was verified;
 * {@code displayName} and {@code language} come from the profile once it is saved (Story 2.3). */
public record Account(UUID id, String email, String givenName, String displayName, String language) {

    /** An account with no profile yet. */
    public Account(UUID id, String email, String givenName) {
        this(id, email, givenName, null, null);
    }
}
