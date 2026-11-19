import { useEffect, useState } from 'react';
import { fetchMatchResult, RatingsError } from './ratingsApi.ts';

/** How long the client keeps asking for a match's rating change before it says "updating". */
export const RETRY_WINDOW_MS = 10_000;
/** Waits between attempts: 0.5 s, 1 s, then 2 s. */
export const retryDelayMs = (attempt: number): number => [500, 1_000][attempt] ?? 2_000;

export type DeltaState =
  | { status: 'hidden' }
  | { status: 'waiting' }
  | { status: 'updating' }
  | { status: 'unrated' }
  | { status: 'ready'; delta: number; after: number };

/**
 * A registered player's rating change for a finished match (FR54). `enabled` is false for a guest's results and
 * for a match known to be unrated, which show nothing at all. While the match is not processed yet (404) or a
 * request fails, it asks again with backoff; when {@link RETRY_WINDOW_MS} has passed on the clock it settles on "updating".
 * `rated: false` from the API settles on "unrated" (nothing shown).
 */
export function useMatchDelta(matchId: string, enabled: boolean): DeltaState {
  const [state, setState] = useState<DeltaState>({ status: enabled ? 'waiting' : 'hidden' });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'hidden' });
      return undefined;
    }
    setState({ status: 'waiting' });
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // The window ends on the clock, whatever a slow or hung request is doing: then it says "updating" and stops.
    const windowTimer = setTimeout(() => {
      closed = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      setState((current) => (current.status === 'waiting' ? { status: 'updating' } : current));
    }, RETRY_WINDOW_MS);

    const settle = (next: DeltaState) => {
      closed = true;
      clearTimeout(windowTimer);
      setState(next);
    };

    const attempt = async (n: number): Promise<void> => {
      try {
        const result = await fetchMatchResult(matchId);
        if (closed) return;
        if (result) {
          if (!result.rated) return settle({ status: 'unrated' });
          // A rated record whose change has not arrived is not final: ask again.
          if (result.delta !== undefined && result.ratingAfter !== undefined) {
            return settle({ status: 'ready', delta: result.delta, after: result.ratingAfter });
          }
        }
      } catch (error) {
        if (closed) return;
        // A permanent refusal (401, 403, 400) will not change by asking again; offline and 5xx are asked again like a 404.
        if (error instanceof RatingsError && error.status !== null && error.status >= 400 && error.status < 500) {
          return settle({ status: 'updating' });
        }
      }
      retryTimer = setTimeout(() => void attempt(n + 1), retryDelayMs(n));
    };
    void attempt(0);

    return () => {
      closed = true;
      clearTimeout(windowTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [matchId, enabled]);

  return state;
}
