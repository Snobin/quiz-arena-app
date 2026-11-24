/**
 * The API origin. `VITE_API_BASE_URL` (build time, e.g. https://api.example.com) points a Pages-hosted
 * build at the VPS; unset or blank keeps every call same-origin (local dev through Vite's proxy, tests).
 */
export function normalizeBase(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBase(import.meta.env.VITE_API_BASE_URL);

/** `path` (starting with "/") on the API origin; the bare path when same-origin. */
export function apiUrl(path: string, base: string = API_BASE_URL): string {
  return `${normalizeBase(base)}${path}`;
}

/** `ws(s)://<host>/ws` for the API origin, or for `location` when no base is set. */
export function wsUrl(
  path: string,
  base: string = API_BASE_URL,
  location: Pick<Location, 'protocol' | 'host'> = window.location,
): string {
  const b = normalizeBase(base);
  if (b) return `${b.replace(/^http/i, 'ws')}${path}`;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`;
}
