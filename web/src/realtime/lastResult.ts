import { parseMatchEnded, type MatchEndedPayload } from './protocol.ts';

/**
 * The last MATCH_ENDED, kept in `sessionStorage` so `/results` survives a reload (UX-DR47).
 * Written only by the connection module (on MATCH_ENDED; cleared on the next MATCH_FOUND); the
 * results screen reads it when the store has no match. Storage can be missing or throw (private
 * mode, blocked storage): every access is guarded, and a missing or corrupt entry reads as none.
 */
export const LAST_RESULT_KEY = 'minnal.lastResult';

export type LastResult = { matchId: string; selfId: string; payload: MatchEndedPayload };

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The stored result, or null when there is none or it does not parse (a corrupt entry is dropped). */
export function load(): LastResult | null {
  let text: string | null = null;
  try {
    text = storage()?.getItem(LAST_RESULT_KEY) ?? null;
  } catch {
    return null;
  }
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null) {
      const { matchId, selfId, payload } = value as Record<string, unknown>;
      const parsed = parseMatchEnded(payload);
      if (
        typeof matchId === 'string' &&
        typeof selfId === 'string' &&
        parsed !== null &&
        parsed.matchId === matchId &&
        parsed.participants.some((p) => p.participantId === selfId)
      ) {
        return { matchId, selfId, payload: parsed };
      }
    }
  } catch {
    // Not JSON: fall through and drop it.
  }
  clear();
  return null;
}

export function save(result: LastResult): void {
  try {
    // Stored in its wire shape: absent optional fields are left out, as the server sends them.
    storage()?.setItem(LAST_RESULT_KEY, JSON.stringify(result, (_, value: unknown) => (value === null ? undefined : value)));
  } catch {
    // Full or blocked storage: the results just won't survive a reload.
  }
}

export function clear(): void {
  try {
    storage()?.removeItem(LAST_RESULT_KEY);
  } catch {
    // Blocked storage: nothing to clear.
  }
}
