import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../auth/session.ts';
import i18n from '../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../profile/profileStore.ts';
import { clearReturnFocus } from '../shell/returnFocus.ts';
import { syncFromLocation } from '../shell/router.ts';
import { clearScrollMemory } from '../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../test-utils/guest.ts';
import { MY_MATCHES_PATH, MY_RATINGS_PATH } from './ratingsApi.ts';
import { formatMatchDate } from './MatchHistory.tsx';

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

const RATINGS = { ratings: [{ mode: 'QUICK', rating: 1216 }, { mode: 'TOPIC_DUEL', rating: 1200 }, { mode: 'BATTLE_ROOM', rating: 1520 }] };
const MATCHES = {
  matches: [
    { matchId: 'a', mode: 'QUICK', result: 'WIN', score: 7840, placement: 1, rated: true, ratingDelta: 16, endedAt: '2026-11-19T20:00:00Z' },
    { matchId: 'b', mode: 'QUICK', result: 'LOSS', score: 3000, placement: 2, rated: true, ratingDelta: -12, endedAt: '2026-11-18T10:00:00Z' },
    { matchId: 'c', mode: 'QUICK', result: 'DRAW', score: 5000, placement: 1, rated: false, endedAt: '2026-11-17T10:00:00Z' },
  ],
};

type Handler = () => Response | Promise<Response>;
function core(handlers: { ratings?: Handler; matches?: Handler }) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === MY_RATINGS_PATH) return (handlers.ratings ?? (() => jsonResponse(RATINGS)))();
      if (url.startsWith(MY_MATCHES_PATH)) return (handlers.matches ?? (() => jsonResponse(MATCHES)))();
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    }),
  );
  return calls;
}

async function boot() {
  session.start();
  await session.ready();
}

beforeEach(async () => {
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  session.reset();
  guestSession.reset();
  resetProfile();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  await act(() => i18n.changeLanguage('ml'));
});

describe('Me: rating trio and match history', () => {
  it('shows the three ratings, grouped with Latin digits, read-only', async () => {
    core({ ratings: () => jsonResponse({ ratings: [{ mode: 'QUICK', rating: 12160 }, { mode: 'TOPIC_DUEL', rating: 1200 }, { mode: 'BATTLE_ROOM', rating: 1520 }] }) });
    await boot();
    renderApp('/me');
    const trio = await screen.findByTestId('rating-trio');
    await waitFor(() => expect(within(trio).getByTestId('rating-QUICK')).toHaveTextContent('12,160'));
    expect(within(trio).getByTestId('rating-QUICK')).toHaveTextContent('Quick Match');
    expect(within(trio).getByTestId('rating-TOPIC_DUEL')).toHaveTextContent('Topic Duel');
    expect(within(trio).getByTestId('rating-BATTLE_ROOM')).toHaveTextContent('1,520');
    expect(within(trio).queryAllByRole('button')).toHaveLength(0);
  });

  it('lists the matches: result, mode, IST date and the delta, or a muted "unrated"', async () => {
    core({});
    await boot();
    renderApp('/me');
    const rows = await screen.findAllByTestId('history-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Won');
    expect(rows[0]).toHaveTextContent('Quick Match');
    expect(rows[0]).toHaveTextContent('+16');
    // 20:00 UTC on 19 Nov is 01:30 IST on 20 Nov: the date shown is the IST one.
    expect(rows[0]).toHaveTextContent(formatMatchDate('2026-11-19T20:00:00Z', 'en'));
    expect(formatMatchDate('2026-11-19T20:00:00Z', 'en')).toMatch(/20 Nov 2026/);
    expect(rows[1]).toHaveTextContent('Lost');
    expect(within(rows[1]!).getByTestId('history-delta')).toHaveTextContent('-12');
    expect(rows[2]).toHaveTextContent('Draw');
    expect(within(rows[2]!).getByTestId('history-unrated')).toHaveTextContent('unrated');
    expect(within(rows[2]!).queryByTestId('history-delta')).toBeNull();
  });

  it('with no matches shows one plain line and a primary action that starts a Quick Match', async () => {
    const user = userEvent.setup();
    core({ matches: () => jsonResponse({ matches: [] }) });
    await boot();
    renderApp('/me');
    const empty = await screen.findByTestId('history-empty');
    expect(empty).toHaveTextContent('No matches yet. Play your first one.');
    await user.click(within(empty).getByRole('button', { name: 'Play a Quick Match' }));
    expect(window.location.pathname).toBe('/matchmaking');
  });

  it('a failed ratings request shows its own retry with the reason; history and the profile still work', async () => {
    const user = userEvent.setup();
    let failing = true;
    core({ ratings: () => (failing ? jsonResponse({ status: 500 }, 500, 'application/problem+json') : jsonResponse(RATINGS)) });
    await boot();
    renderApp('/me');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this: the server had a problem.");
    expect(await screen.findAllByTestId('history-row')).toHaveLength(3);
    expect(screen.getByTestId('profile-section')).toBeInTheDocument();

    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('rating-trio')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a failed history request says offline when the network is down, and retries only history', async () => {
    const user = userEvent.setup();
    let failing = true;
    const calls = core({ matches: () => (failing ? Promise.reject(new TypeError('offline')) : jsonResponse(MATCHES)) });
    await boot();
    renderApp('/me');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this: you're offline.");
    expect(await screen.findByTestId('rating-trio')).toBeInTheDocument();
    const ratingCalls = calls.filter((u) => u === MY_RATINGS_PATH).length;

    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByTestId('history-row')).toHaveLength(3);
    expect(calls.filter((u) => u === MY_RATINGS_PATH).length).toBe(ratingCalls); // the trio was not refetched
  });

  it('a 404 on the ratings route is an error with a retry, not an empty trio', async () => {
    core({ ratings: () => jsonResponse({ status: 404 }, 404, 'application/problem+json') });
    await boot();
    renderApp('/me');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this");
    expect(screen.queryByTestId('rating-trio')).toBeNull();
  });

  it('forgets her ratings and history when she is no longer signed in', async () => {
    core({});
    await boot();
    const { unmount } = renderApp('/me');
    await screen.findAllByTestId('history-row');
    unmount();
    // A new account on the same tab: nothing of the previous one is shown while its own data loads.
    session.reset();
    const client = new QueryClient();
    client.setQueryData(['ratings', 'me'], []);
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.getQueryData(['ratings', 'me'])).toBeUndefined());
  });

  it('guests never see the trio or the history, and ask the ratings API nothing', async () => {
    const calls = core({});
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return url === GUEST_TOKEN_PATH ? jsonResponse(guestTokenBody('en')) : jsonResponse({ status: 401 }, 401, 'application/problem+json');
    });
    await boot();
    renderApp('/me');
    await screen.findAllByTestId('sign-in-nudge');
    expect(screen.queryByTestId('rating-trio')).toBeNull();
    expect(screen.queryByTestId('match-history')).toBeNull();
    expect(calls.some((u) => u.includes('/api/ratings/'))).toBe(false);
  });
});

describe('Home: the rating trio', () => {
  it('shows the trio to a registered player', async () => {
    core({});
    await boot();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Hi, Anju' });
    expect(await screen.findByTestId('rating-trio')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('rating-QUICK')).toHaveTextContent('1,216'));
  });
});

describe('formatMatchDate', () => {
  it('shows Indian Standard Time, with Latin digits in Malayalam too', () => {
    expect(formatMatchDate('2026-11-19T20:00:00Z', 'ml')).toMatch(/20/);
    expect(formatMatchDate('2026-11-19T20:00:00Z', 'ml')).toMatch(/2026/);
    expect(formatMatchDate('2026-11-19T20:00:00Z', 'ml')).not.toMatch(/[൦-൯]/);
  });
});
