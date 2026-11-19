package in.minnal.core.identity.application;

/**
 * A verified identity from a {@link LoginMethod}: who the provider says the person is. {@code email}
 * is only meaningful when {@code emailVerified}; {@code givenName} may be null.
 */
public record ExternalIdentity(String provider, String subject, String email, boolean emailVerified, String givenName) {
}
