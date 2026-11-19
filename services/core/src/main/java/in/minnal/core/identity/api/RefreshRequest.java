package in.minnal.core.identity.api;

/** Optional {@code POST /api/core/v1/auth/refresh} body: the language the player is using. */
public record RefreshRequest(String lang) {
}
