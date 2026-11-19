package in.minnal.core.identity.application;

import java.util.UUID;

/** A registered player as the token issuer sees them. {@code email} is set only when it was verified. */
public record Account(UUID id, String email, String givenName) {
}
