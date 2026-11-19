import { apiFetch } from '../auth/apiFetch.ts';
import { apiUrl } from '../config/apiBase.ts';

/** The ratings-service read API (Story 2.6): the signed-in player's own ratings and matches. */
export const MATCH_PATH = (matchId: string) => `/api/ratings/v1/matches/${encodeURIComponent(matchId)}`;
export const MY_RATINGS_PATH = '/api/ratings/v1/me/ratings';
export const MY_MATCHES_PATH = '/api/ratings/v1/me/matches';

export type Mode = 'QUICK' | 'TOPIC_DUEL' | 'BATTLE_ROOM';
export type MatchResult = { matchId: string; mode: Mode; rated: boolean; ratingBefore?: number; ratingAfter?: number; delta?: number };
export type ModeRating = { mode: Mode; rating: number };
export type HistoryEntry = {
  matchId: string;
  mode: Mode;
  result: 'WIN' | 'LOSS' | 'DRAW';
  score: number;
  placement: number;
  rated: boolean;
  ratingDelta?: number;
  endedAt: string;
};

/** Why a request failed, for the inline message: the network (offline) or the server. */
export class RatingsError extends Error {
  readonly reason: 'network' | 'server';
  /** The HTTP status when the server answered; a 4xx other than 404 is permanent, so asking again will not help. */
  readonly status: number | null;

  constructor(reason: 'network' | 'server', message: string, status: number | null = null) {
    super(message);
    this.name = 'RatingsError';
    this.reason = reason;
    this.status = status;
  }
}

/** `notFoundIsEmpty`: a 404 is a normal answer (a match not processed yet); elsewhere it means a broken route. */
async function getJson<T>(path: string, notFoundIsEmpty: boolean): Promise<{ status: number; body: T | null }> {
  let response: Response;
  try {
    response = await apiFetch(apiUrl(path), { headers: { Accept: 'application/json' } });
  } catch {
    throw new RatingsError('network', 'could not reach the server');
  }
  if (response.status === 404 && notFoundIsEmpty) return { status: 404, body: null };
  if (!response.ok) throw new RatingsError('server', `ratings request failed: ${response.status}`, response.status);
  try {
    return { status: response.status, body: (await response.json()) as T };
  } catch {
    throw new RatingsError('server', 'ratings response is not JSON', response.status);
  }
}

/** The caller's result for a match, or null while it has not been processed yet (404). */
export async function fetchMatchResult(matchId: string): Promise<MatchResult | null> {
  return (await getJson<MatchResult>(MATCH_PATH(matchId), true)).body;
}

export async function fetchMyRatings(): Promise<ModeRating[]> {
  const { body } = await getJson<{ ratings: ModeRating[] }>(MY_RATINGS_PATH, false);
  return body?.ratings ?? [];
}

export async function fetchMyMatches(limit = 20): Promise<HistoryEntry[]> {
  const { body } = await getJson<{ matches: HistoryEntry[] }>(`${MY_MATCHES_PATH}?limit=${limit}`, false);
  return body?.matches ?? [];
}
