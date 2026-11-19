package in.minnal.core.profile.application;

/** {@code PUT /api/core/v1/me/profile} body. */
public record ProfileRequest(String displayName, String district, String examLevel, String language) {
}
