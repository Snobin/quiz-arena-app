/**
 * The id of the match she is playing, kept in `sessionStorage` so `/match` can rejoin it after a
 * page reload (fix: rejoin after reload). Written only by the connection module: set at
 * MATCH_FOUND (and after a rejoin), cleared once the match settles for her (any outcome), when a
 * rejoin finds it gone, or replaced by the next MATCH_FOUND. It is a hint only: the server decides
 * whether she is still in that match. `sessionStorage` is per tab, so a fresh tab learns the id
 * from ALREADY_IN_MATCH instead. Storage can be missing or throw: every access is guarded, and a
 * missing or corrupt entry reads as none.
 */
export const LIVE_MATCH_ID_KEY = 'minnal.liveMatchId';

export type LiveMatchId = { matchId: string };

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The stored id, or null when there is none or it does not parse (a corrupt entry is dropped). */
export function load(): LiveMatchId | null {
  let text: string | null = null;
  try {
    text = storage()?.getItem(LIVE_MATCH_ID_KEY) ?? null;
  } catch {
    return null;
  }
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null) {
      const { matchId } = value as Record<string, unknown>;
      if (typeof matchId === 'string' && matchId.length > 0) return { matchId };
    }
  } catch {
    // Not JSON: fall through and drop it.
  }
  clear();
  return null;
}

export function save(entry: LiveMatchId): void {
  try {
    storage()?.setItem(LIVE_MATCH_ID_KEY, JSON.stringify({ matchId: entry.matchId }));
  } catch {
    // Full or blocked storage: a reload just won't find the match.
  }
}

export function clear(): void {
  try {
    storage()?.removeItem(LIVE_MATCH_ID_KEY);
  } catch {
    // Blocked storage: nothing to clear.
  }
}
