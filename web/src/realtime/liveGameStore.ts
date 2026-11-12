import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { ErrorCode, MatchFoundPayload } from './protocol.ts';

/**
 * The live-game store (AD-18). Only the WebSocket module (`connection.ts`) writes it; components
 * read it with `useLiveGame` and act through `joinQuickMatch` / `cancelMatchmaking`.
 *
 * Phases: `idle` → `searching` (connecting or queued) → `found`, or → `cancelling` → `cancelled`,
 * or → `failed` with a `problem` saying why.
 */
export type LivePhase = 'idle' | 'searching' | 'cancelling' | 'cancelled' | 'found' | 'failed';

export type LiveProblem =
  /** The question set could not be fetched (MATCHMAKING_FAILED). */
  | { kind: 'matchmaking' }
  /** The socket could not open, or closed while searching. */
  | { kind: 'connection' }
  /** game-service is restarting (SERVER_DRAINING). */
  | { kind: 'draining' }
  /** Already queued or in a match from another tab or device. */
  | { kind: 'alreadyInMatch'; matchId?: string }
  /** Any other refusal. */
  | { kind: 'rejected'; code: ErrorCode };

export type LiveGameState = {
  phase: LivePhase;
  /** The last MATCH_FOUND, kept until the next one. */
  match: MatchFoundPayload | null;
  problem: LiveProblem | null;
  /** Server clock minus device clock, from the last message's `serverTime`. */
  clockOffsetMs: number;
};

export const INITIAL_LIVE_GAME: LiveGameState = { phase: 'idle', match: null, problem: null, clockOffsetMs: 0 };

/** The store itself. Write access is for `connection.ts` only. */
export const liveGameStore = createStore<LiveGameState>(() => INITIAL_LIVE_GAME);

export function useLiveGame<T>(selector: (state: LiveGameState) => T): T {
  return useStore(liveGameStore, selector);
}

export { cancelMatchmaking, joinQuickMatch } from './connection.ts';
