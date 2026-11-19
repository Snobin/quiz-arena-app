import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { MATCH_PATH } from '../../ratings/ratingsApi.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { parseMatchEnded } from '../../realtime/protocol.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, restartGuestSession, stubFetch, utf8Jwt } from '../../test-utils/guest.ts';
import { matchEnded } from '../../test-utils/realtime.ts';

const MATCH_ID = 'm-delta';

function storeResult({ you, them, guest, source = 'BANK' }: { you: number; them: number; guest: boolean; source?: 'BANK' | 'CUSTOM' }) {
  const placementMe = you >= them ? 1 : 2;
  const placementThem = them >= you ? 1 : 2;
  const raw = matchEnded(MATCH_ID, {
    participants: [
      { participantId: 'me', displayName: 'Anju', kind: 'USER', score: you, correctCount: 1, placement: placementMe },
      { participantId: 'them', displayName: 'Rahul', kind: 'USER', score: them, correctCount: 1, placement: placementThem },
    ],
    breakdown: { me: [{ pickedIndex: 0, correct: true, responseMs: 2000, points: you }], them: [{ pickedIndex: 0, correct: true, responseMs: 2500, points: them }] },
  }).payload as Record<string, unknown>;
  raw.questionSource = source;
  const payload = parseMatchEnded(raw)!;
  lastResult.save({ matchId: MATCH_ID, selfId: 'me', payload, guest });
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

type MatchReply = () => Response;
function registeredCore(matchReplies: MatchReply[]) {
  const queue = [...matchReplies];
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === MATCH_PATH(MATCH_ID)) return (queue.shift() ?? (() => jsonResponse({ status: 404 }, 404, 'application/problem+json')))();
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      return jsonResponse({ ratings: [], matches: [] });
    }),
  );
  return urls;
}

const ratedReply = (delta: number): MatchReply => () =>
  jsonResponse({ matchId: MATCH_ID, mode: 'QUICK', rated: true, ratingBefore: 1200, ratingAfter: 1200 + delta, delta });

async function openRegistered(matchReplies: MatchReply[], result: Parameters<typeof storeResult>[0]) {
  const urls = registeredCore(matchReplies);
  storeResult(result);
  session.start();
  await session.ready();
  renderApp('/results');
  return urls;
}

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

describe('the rating change on a registered player’s results', () => {
  it('a win shows a volt chip "+24" in the band and adds the rating to the heading name', async () => {
    await openRegistered([ratedReply(24)], { you: 7000, them: 3000, guest: false });
    const chip = await screen.findByTestId('rating-delta');
    expect(chip).toHaveTextContent('+24');
    expect(chip).toHaveAttribute('data-accent'); // the volt chip (volt itself lives in design/peak)
    expect(screen.getByTestId('results-band')).toContainElement(chip);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('You won, 7,000 to 3,000, rating +24'));
  });

  it('a loss shows a grey delta with no volt', async () => {
    await openRegistered([ratedReply(-12)], { you: 3000, them: 7000, guest: false });
    const delta = await screen.findByTestId('rating-delta');
    expect(delta).toHaveTextContent('-12');
    expect(delta.className).not.toMatch(/volt/);
    expect(delta.hasAttribute('data-accent')).toBe(false);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(/You lost, 3,000 to 7,000, rating -12/));
  });

  it('keeps one slot from the first paint (no layout shift): placeholder, then the delta', async () => {
    let release: (reply: Response) => void = () => undefined;
    const gate = new Promise<Response>((resolve) => (release = resolve));
    await openRegistered([() => gate as unknown as Response], { you: 7000, them: 3000, guest: false });
    const slot = await screen.findByTestId('rating-delta-slot');
    expect(slot.className).toMatch(/min-h-/);
    expect(screen.getByTestId('rating-delta-waiting')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('rating-delta')).toBeNull();

    release(ratedReply(24)());
    expect(await screen.findByTestId('rating-delta')).toHaveTextContent('+24');
    expect(screen.getByTestId('rating-delta-slot')).toBe(slot); // the same element: nothing moved
    expect(screen.queryByTestId('rating-delta-waiting')).toBeNull();
  });

  it('retries a 404 and shows the delta when it arrives', async () => {
    const notYet = () => jsonResponse({ status: 404 }, 404, 'application/problem+json');
    const urls = await openRegistered([notYet, ratedReply(24)], { you: 7000, them: 3000, guest: false });
    expect(await screen.findByTestId('rating-delta', {}, { timeout: 5000 })).toHaveTextContent('+24');
    expect(urls.filter((u) => u === MATCH_PATH(MATCH_ID)).length).toBe(2);
  });

  it('a draw shows a grey delta, never a volt chip', async () => {
    await openRegistered([ratedReply(0)], { you: 5000, them: 5000, guest: false });
    const delta = await screen.findByTestId('rating-delta');
    expect(delta).toHaveTextContent('0');
    expect(delta.hasAttribute('data-accent')).toBe(false);
  });

  it('after 10 s with no result the slot says "updating" and stays the same element', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    await openRegistered([], { you: 7000, them: 3000, guest: false });
    const slot = await screen.findByTestId('rating-delta-slot');
    expect(screen.getByTestId('rating-delta-waiting')).toBeInTheDocument();
    await act(async () => void (await vi.advanceTimersByTimeAsync(10_500)));
    expect(screen.getByTestId('rating-delta-updating')).toHaveTextContent('updating');
    expect(screen.getByTestId('rating-delta-slot')).toBe(slot);
  });

  it('announces the rating politely once it arrives', async () => {
    await openRegistered([ratedReply(24)], { you: 7000, them: 3000, guest: false });
    await screen.findByTestId('rating-delta');
    await waitFor(() => expect(useAnnouncements.getState().polite.text.trim()).toBe('rating +24'));
  });

  it('shows nothing for a guest’s results', async () => {
    stubFetch();
    restartGuestSession();
    storeResult({ you: 7000, them: 3000, guest: true });
    renderApp('/results');
    await screen.findByTestId('results-band');
    expect(screen.queryByTestId('rating-delta-slot')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.map(([u]) => String(u)).some((u) => u.includes('/api/ratings/'))).toBe(false);
  });

  it('shows nothing and asks nothing for a custom-topic (unrated) match', async () => {
    const urls = await openRegistered([], { you: 7000, them: 3000, guest: false, source: 'CUSTOM' });
    await screen.findByTestId('results-band');
    expect(screen.queryByTestId('rating-delta-slot')).toBeNull();
    expect(urls).not.toContain(MATCH_PATH(MATCH_ID));
  });

  it('removes the slot when the API says the match was not rated', async () => {
    await openRegistered([() => jsonResponse({ matchId: MATCH_ID, mode: 'QUICK', rated: false })], { you: 7000, them: 3000, guest: false });
    // The reserved slot stays (empty), so the band does not reflow; no chip, placeholder or "updating" text.
    const slot = await screen.findByTestId('rating-delta-slot');
    await waitFor(() => expect(slot).toBeEmptyDOMElement());
    expect(screen.getByTestId('rating-delta-slot')).toBe(slot);
    expect(screen.queryByTestId('rating-delta')).toBeNull();
    expect(screen.queryByText(/updating/i)).toBeNull();
  });
});
