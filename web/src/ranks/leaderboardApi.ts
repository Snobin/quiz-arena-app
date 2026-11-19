import { apiFetch } from '../auth/apiFetch.ts';
import { apiUrl } from '../config/apiBase.ts';
import { RatingsError, type Mode } from '../ratings/ratingsApi.ts';

/** The leaderboard read API (Story 2.7): any valid token, guests included. */
export type Period = 'daily' | 'weekly' | 'alltime';
export const MODES: readonly Mode[] = ['QUICK', 'TOPIC_DUEL', 'BATTLE_ROOM'];
export const PERIODS: readonly Period[] = ['daily', 'weekly', 'alltime'];
export const PAGE = 50;

export type BoardEntry = { rank: number; userId: string; displayName: string; district: string; value: number };
export type Board = {
  mode: Mode;
  period: Period;
  periodKey: string;
  measure: 'RATING_GAINED' | 'RATING';
  entries: BoardEntry[];
  /** Present for a registered caller (null when she has no position); absent for a guest. */
  me?: { rank: number; value: number } | null;
};

/** The query key of a board page: guests and registered players do not share one (only hers carries `me`). */
export const boardKey = (registered: boolean, mode: Mode, period: Period, offset: number) =>
  ['leaderboard', registered ? 'member' : 'guest', mode, period, offset] as const;

export const boardPath = (mode: Mode, period: Period, offset: number, limit: number) =>
  `/api/ratings/v1/leaderboards/${mode}/${period}?offset=${offset}&limit=${limit}`;

export async function fetchBoard(mode: Mode, period: Period, offset = 0, limit = PAGE, signal?: AbortSignal): Promise<Board> {
  let response: Response;
  try {
    response = await apiFetch(apiUrl(boardPath(mode, period, offset, limit)), { headers: { Accept: 'application/json' }, signal });
  } catch {
    throw new RatingsError('network', 'could not reach the server');
  }
  if (!response.ok) throw new RatingsError('server', `leaderboard request failed: ${response.status}`, response.status);
  try {
    return (await response.json()) as Board;
  } catch {
    throw new RatingsError('server', 'leaderboard response is not JSON', response.status);
  }
}
