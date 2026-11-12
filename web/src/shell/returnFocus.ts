/**
 * Return focus across a detour (e.g. Home → Sign-in prompt → Back): the element to focus when the
 * app comes back to `path`. AppShell consumes it after a navigation, before its default of focusing
 * the new screen's `main h1`. A target survives one detour screen only: a second navigation that
 * does not return to `path` drops it.
 */
type Pending = { id: string; path: string; away: boolean };

let pending: Pending | null = null;

/** Focus element `#id` when the app next shows `path`. */
export function setReturnFocus(id: string, path: string): void {
  pending = { id, path, away: false };
}

/**
 * Called on every navigation: the element to focus on arrival at `pathname`, or null. A match is
 * consumed; a non-matching navigation keeps the target for one detour, then drops it.
 */
export function consumeReturnFocus(pathname: string): HTMLElement | null {
  if (!pending) return null;
  if (pending.path === pathname) {
    const { id } = pending;
    pending = null;
    return document.getElementById(id);
  }
  if (pending.away) pending = null;
  else pending.away = true;
  return null;
}

/** Test helper. */
export function clearReturnFocus(): void {
  pending = null;
}
