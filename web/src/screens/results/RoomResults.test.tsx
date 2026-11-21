import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { MATCH_PATH } from '../../ratings/ratingsApi.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { parseMatchEnded } from '../../realtime/protocol.ts';
import { resetAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';
import { matchEnded } from '../../test-utils/realtime.ts';

/** Story 5.5: the Battle Room results, rehydrated from sessionStorage (the same path as a live arrival's screen). */

const MATCH_ID = 'm-room';
const NAMES = ['Fathima S', 'Biju', 'Anju', 'Devan', 'Chitra'];
const SCORES = [4610, 4610, 3960, 1200, 300];
const PLACEMENTS = [1, 1, 3, 4, 5];

function storeRoom(selfIndex: number, o: { forfeited?: number; source?: 'BANK' | 'CUSTOM' } = {}) {
  const ids = NAMES.map((_, i) => `p${i}`);
  const raw = matchEnded(MATCH_ID, {
    mode: 'BATTLE_ROOM',
    questionSource: o.source ?? 'BANK',
    participants: ids.map((participantId, i) => ({
      participantId,
      displayName: NAMES[i]!,
      kind: 'USER',
      score: SCORES[i]!,
      correctCount: 3,
      placement: PLACEMENTS[i]!,
      forfeited: i === o.forfeited,
    })),
    breakdown: Object.fromEntries(ids.map((id) => [id, [{ pickedIndex: 0, correct: true, responseMs: 2000, points: 100 }, { correct: false, points: 0 }]])),
    count: 2,
  }).payload as Record<string, unknown>;
  raw.room = { roomId: 'room-1', hostParticipantId: 'p0' };
  raw.topic = { topicId: 't1', name: 'Kerala Renaissance', subjectName: 'History' };
  lastResult.save({ matchId: MATCH_ID, selfId: ids[selfIndex]!, payload: parseMatchEnded(raw)!, guest: false });
}

function renderApp(path: string) {
  window.history.pushState(null, '', path);
  syncFromLocation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

function stubCore(match: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === MATCH_PATH(MATCH_ID)) return match();
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      return jsonResponse({ ratings: [], matches: [] });
    }),
  );
}

async function open(selfIndex: number, match: () => Response, o: Parameters<typeof storeRoom>[1] = {}) {
  stubCore(match);
  storeRoom(selfIndex, o);
  session.start();
  await session.ready();
  renderApp('/results');
}

const rated = (delta: number) => () =>
  jsonResponse({ matchId: MATCH_ID, mode: 'BATTLE_ROOM', rated: true, ratingBefore: 1200, ratingAfter: 1200 + delta, delta });

beforeEach(async () => {
  window.sessionStorage.clear();
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  resetRealtime();
  session.reset();
  guestSession.reset();
  resetProfile();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  await act(() => i18n.changeLanguage('ml'));
});

describe('Battle Room results', () => {
  it('a player who is not first lands on the settled view: "#3 of 5", her score, a grey delta, podium and standings', async () => {
    await open(2, rated(-6));
    const band = await screen.findByTestId('results-band');
    expect(within(band).getByTestId('results-line')).toHaveTextContent('#3 of 5');
    expect(within(band).getByTestId('results-self-score')).toHaveTextContent('3,960');
    expect(band).toHaveAttribute('data-result', 'loss');
    const delta = await screen.findByTestId('rating-delta');
    expect(delta).toHaveTextContent('-6');
    expect(delta).not.toHaveAttribute('data-accent');
    expect(screen.queryByTestId('takeover-bolt')).toBeNull();
    expect(screen.getAllByTestId('podium-column')).toHaveLength(3);
    expect(screen.getAllByTestId('results-standings-row')).toHaveLength(5);
    expect(screen.getByTestId('self-tag')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(/Place 3 of 5, 3,960 points, rating -6/));
    expect(document.title).toContain('Battle Room results');
  });

  it('a joint winner has a volt chip delta and no takeover', async () => {
    await open(0, rated(11));
    const chip = await screen.findByTestId('rating-delta');
    expect(chip).toHaveAttribute('data-accent');
    expect(screen.getByTestId('results-line')).toHaveTextContent('#1 of 5');
    expect(screen.queryByTestId('takeover-bolt')).toBeNull();
  });

  it('holds the delta slot with no shift and says "updating" after 10 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    await open(2, () => jsonResponse({ status: 404 }, 404, 'application/problem+json'));
    const slot = await screen.findByTestId('rating-delta-slot');
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_500)));
    expect(screen.getByTestId('rating-delta-slot')).toBe(slot);
    expect(screen.getByTestId('rating-delta-updating')).toHaveTextContent('updating');
  });

  it('shows Home only (no Rematch, no Share), and Home goes to the Home screen', async () => {
    await open(2, rated(-6));
    const bar = await screen.findByTestId('results-actions');
    expect(within(bar).getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByTestId('rematch-button')).toBeNull();
    act(() => within(bar).getByRole('button', { name: 'Home' }).click());
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('a forfeiter appears in the standings with the "left" tag, ranked on her earned score', async () => {
    await open(2, rated(-6), { forfeited: 4 });
    await screen.findByTestId('results-band');
    const rows = screen.getAllByTestId('results-standings-row');
    expect(within(rows[4]!).getByTestId('left-tag')).toBeInTheDocument();
    expect(rows[4]).toHaveAttribute('aria-label', expect.stringContaining('Place 5, Chitra, 300 points'));
  });

  it('the breakdown has the room question count of dots', async () => {
    await open(2, rated(-6));
    expect(await screen.findByTestId('dot-strip')).toBeInTheDocument();
    expect(within(screen.getByTestId('dot-strip')).getAllByRole('listitem')).toHaveLength(2);
  });
});
