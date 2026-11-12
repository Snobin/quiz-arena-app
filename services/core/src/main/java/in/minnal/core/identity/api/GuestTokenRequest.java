package in.minnal.core.identity.api;

/** {@code POST /api/core/v1/auth/guest} body: {@code {"lang": "ml" | "en"}}. */
public record GuestTokenRequest(String lang) {
}
