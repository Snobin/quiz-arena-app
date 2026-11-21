import { parseMatchEnded, parseRoomSucceeded, type MatchEndedPayload, type RoomSucceededPayload } from './protocol.ts';

/**
 * The last MATCH_ENDED, kept in `sessionStorage` so `/results` survives a reload (UX-DR47).
 * Written only by the connection module (on MATCH_ENDED; cleared on the next MATCH_FOUND); the
 * results screen reads it when the store has no match. Storage can be missing or throw (private
 * mode, blocked storage): every access is guarded, and a missing or corrupt entry reads as none.
 */
export const LAST_RESULT_KEY = 'minnal.lastResult';

/**
 * `guest`: she was not signed in when the match ended (Story 2.4). An entry written before this existed has
 * none, which reads as null (unknown): the results then decide from her session, never silently as registered.
 */
export type LastResult = {
  matchId: string;
  selfId: string;
  payload: MatchEndedPayload;
  guest: boolean | null;
  /** Device time (ms) the MATCH_ENDED was stored: a room's 60 s play-again window counts from it. Null on an older entry. */
  endedAt: number | null;
  /** The room's successor (ROOM_SUCCEEDED, Story 5.6), while its window lasts; null otherwise. */
  succeeded: RoomSucceededPayload | null;
};

/** How long after MATCH_ENDED a room match can be played again (game-service's post-match window). */
export const PLAY_AGAIN_WINDOW_MS = 60_000;

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
      const { matchId, selfId, payload, guest, endedAt, succeeded } = value as Record<string, unknown>;
      const parsed = parseMatchEnded(payload);
      if (
        typeof matchId === 'string' &&
        typeof selfId === 'string' &&
        parsed !== null &&
        parsed.matchId === matchId &&
        parsed.participants.some((p) => p.participantId === selfId)
      ) {
        const at = typeof endedAt === 'number' && Number.isFinite(endedAt) ? endedAt : null;
        // The successor is dropped once the window has passed.
        const next = at !== null && Date.now() < at + PLAY_AGAIN_WINDOW_MS ? parseRoomSucceeded(succeeded) : null;
        return { matchId, selfId, payload: parsed, guest: typeof guest === 'boolean' ? guest : null, endedAt: at, succeeded: next };
      }
    }
  } catch {
    // Not JSON: fall through and drop it.
  }
  clear();
  return null;
}

export function save(result: Omit<LastResult, 'guest' | 'endedAt' | 'succeeded'> & { guest: boolean }): void {
  try {
    // A MATCH_ENDED seen again keeps its first time and any successor already stored with it.
    let kept: Record<string, unknown> = {};
    try {
      const previous: unknown = JSON.parse(storage()?.getItem(LAST_RESULT_KEY) ?? 'null');
      if (typeof previous === 'object' && previous !== null && (previous as Record<string, unknown>).matchId === result.matchId) {
        kept = { endedAt: (previous as Record<string, unknown>).endedAt, succeeded: (previous as Record<string, unknown>).succeeded };
      }
    } catch {
      // Unreadable: written fresh.
    }
    const entry = { ...result, endedAt: Date.now(), ...(typeof kept.endedAt === 'number' && { endedAt: kept.endedAt }), ...(kept.succeeded !== undefined && { succeeded: kept.succeeded }) };
    // Stored in its wire shape: absent optional fields are left out, as the server sends them.
    storage()?.setItem(LAST_RESULT_KEY, JSON.stringify(entry, (_, value: unknown) => (value === null ? undefined : value)));
  } catch {
    // Full or blocked storage: the results just won't survive a reload.
  }
}

/** Keeps the ROOM_SUCCEEDED of the stored match `matchId` with its MATCH_ENDED, so a reload within the window restores the Join button. */
export function saveSucceeded(matchId: string, succeeded: RoomSucceededPayload): void {
  try {
    const text = storage()?.getItem(LAST_RESULT_KEY) ?? null;
    if (text === null) return;
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || (value as Record<string, unknown>).matchId !== matchId) return;
    storage()?.setItem(LAST_RESULT_KEY, JSON.stringify({ ...value, succeeded }));
  } catch {
    // Blocked or corrupt storage: the Join button just won't survive a reload.
  }
}

/**
 * Story 3.5: the questions she tapped "Something wrong?" on during the live reveals, kept next to the stored
 * MATCH_ENDED (its own key, since marks are made before MATCH_ENDED exists) and dropped with it. Entries are
 * `questionId:version`; they belong to one match, so another match's marks never show.
 */
export const REPORT_MARKS_KEY = 'minnal.lastResult.marks';

export function markKey(questionId: string, version: number): string {
  return `${questionId}:${version}`;
}

export function loadMarks(matchId: string): string[] {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(REPORT_MARKS_KEY) ?? 'null');
    if (typeof value === 'object' && value !== null) {
      const { matchId: stored, marks } = value as Record<string, unknown>;
      if (stored === matchId && Array.isArray(marks)) return marks.filter((m): m is string => typeof m === 'string');
    }
  } catch {
    // Blocked or corrupt storage reads as no marks.
  }
  return [];
}

export function saveMark(matchId: string, questionId: string, version: number): void {
  try {
    const marks = new Set(loadMarks(matchId));
    marks.add(markKey(questionId, version));
    storage()?.setItem(REPORT_MARKS_KEY, JSON.stringify({ matchId, marks: [...marks] }));
  } catch {
    // Blocked storage: the mark just won't survive a reload.
  }
}

/** Drops one mark once her report for that question is in, so a reload does not reopen its note field. */
export function removeMark(matchId: string, questionId: string, version: number): void {
  try {
    const key = markKey(questionId, version);
    const marks = loadMarks(matchId).filter((m) => m !== key);
    storage()?.setItem(REPORT_MARKS_KEY, JSON.stringify({ matchId, marks }));
  } catch {
    // Blocked storage: nothing to remove.
  }
}

export function clear(): void {
  try {
    storage()?.removeItem(REPORT_MARKS_KEY);
    storage()?.removeItem(LAST_RESULT_KEY);
  } catch {
    // Blocked storage: nothing to clear.
  }
}
