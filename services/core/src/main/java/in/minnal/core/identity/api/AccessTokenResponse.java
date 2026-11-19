package in.minnal.core.identity.api;

import java.time.Instant;

/** {@code {accessToken, expiresAt}}; {@code expiresAt} is ISO-8601 UTC. */
public record AccessTokenResponse(String accessToken, Instant expiresAt) {
}
