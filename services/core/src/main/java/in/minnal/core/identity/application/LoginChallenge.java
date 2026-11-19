package in.minnal.core.identity.application;

/** The per-sign-in secrets held in the short-lived cookie: CSRF state, ID-token nonce, PKCE verifier. */
public record LoginChallenge(String state, String nonce, String codeVerifier) {
}
