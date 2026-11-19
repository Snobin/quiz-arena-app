package in.minnal.core.profile.application;

/** {@code GET /api/core/v1/me/profile}: nulls and {@code profileComplete=false} until setup is saved. */
public record ProfileView(String displayName, String district, String examLevel, String language, boolean profileComplete) {
}
