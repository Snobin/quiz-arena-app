/** The Sign-in prompt route for a return path, e.g. '/sign-in?returnTo=/'. */
export function signInPath(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(returnTo).replace(/%2F/gi, '/')}`;
}

/**
 * A safe in-app return path: resolved against this origin (so tabs, newlines and backslashes are
 * normalised the way a browser would), same origin only, returned as path + query + hash. Anything
 * else, including '//host' and other schemes, is Home.
 */
export function safeReturnPath(value: string | null, origin: string = window.location.origin): string {
  if (!value || !value.startsWith('/')) return '/';
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}
