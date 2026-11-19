import { apiUrl } from '../config/apiBase.ts';

/** `GET /api/core/v1/auth/google/start?returnTo=<path>`: where the whole page goes to sign in. */
export function googleStartUrl(returnTo: string): string {
  return apiUrl(`/api/core/v1/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`);
}

/** Overridable in tests (jsdom cannot navigate). */
export const pageNavigation = {
  assign: (url: string): void => window.location.assign(url),
};

/**
 * Starts "Continue with Google": a full-page navigation (no popup, One Tap or iframe), so the
 * browser leaves the app and comes back to /auth/return. `returnTo` is an in-app path; core
 * re-validates it, so this is a convenience, not the guard.
 */
export function startGoogleSignIn(returnTo: string): void {
  pageNavigation.assign(googleStartUrl(returnTo));
}
