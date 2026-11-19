/**
 * The origin of core-service's public API. Empty (the default) means same origin: the Vite proxy in
 * development, Caddy in the Compose stack. Set `VITE_API_BASE_URL` (e.g. https://api.minnal.in) when
 * the PWA is hosted on a different origin, which needs a shared registrable domain for the refresh
 * cookie to be first-party.
 */
const configured: string = (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL ?? '';

/** An absolute-or-relative URL for an API path such as '/api/core/v1/auth/refresh'. */
export function apiUrl(path: string, base: string = configured): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}
