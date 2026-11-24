import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { pageNavigation } from '../../auth/googleSignIn.ts';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { parseMatchEnded } from '../../realtime/protocol.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { resetAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, restartGuestSession, stubFetch, utf8Jwt } from '../../test-utils/guest.ts';
import { matchEnded } from '../../test-utils/realtime.ts';

type Rival = { name: string; kind: 'USER' | 'BOT' | 'GUEST'; score: number };

/** A finished 1v1 stored in sessionStorage, as Story 1.10 keeps it. */
function storeResult({ you, rival, guest }: { you: number; rival: Rival; guest: boolean }) {
  const placementMe = you > rival.score ? 1 : you === rival.score ? 1 : 2;
  const placementRival = rival.score > you ? 1 : rival.score === you ? 1 : 2;
  const payload = parseMatchEnded(
    matchEnded('m-guest', {
      participants: [
        { participantId: 'me', displayName: 'Guest 4821', kind: 'GUEST', score: you, correctCount: 1, placement: placementMe },
        { participantId: 'them', displayName: rival.name, kind: rival.kind, score: rival.score, correctCount: 1, placement: placementRival },
      ],
      breakdown: {
        me: [{ pickedIndex: 0, correct: true, responseMs: 2000, points: you }],
        them: [{ pickedIndex: 0, correct: true, responseMs: 2500, points: rival.score }],
      },
    }).payload,
  )!;
  lastResult.save({ matchId: 'm-guest', selfId: 'me', payload, guest });
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

const prompt = () => screen.getByTestId('results-sign-in-prompt');

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
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  await act(() => i18n.changeLanguage('ml'));
});

describe('guest results prompt', () => {
  async function guestResults(args: { you: number; rival: Rival }) {
    stubFetch();
    restartGuestSession();
    storeResult({ ...args, guest: true });
    renderApp('/results');
    return screen.findByTestId('results-sign-in-prompt');
  }

  it.each([
    ['win', { you: 7840, rival: { name: 'Rahul', kind: 'GUEST', score: 3000 } }, 'You scored 7,840. Sign in and your next win moves your Quick Match rating.'],
    ['loss', { you: 3000, rival: { name: 'Rahul', kind: 'GUEST', score: 6200 } }, 'Rahul won this one. You scored 3,000. Sign in and your next match can move your Quick Match rating.'],
    ['draw', { you: 5400, rival: { name: 'Rahul', kind: 'USER', score: 5400 } }, 'A draw at 5,400. Sign in and your next win moves your Quick Match rating.'],
    ['bot', { you: 7100, rival: { name: 'Minnal Bot', kind: 'BOT', score: 2000 } }, 'You scored 7,100 against a practice bot. Sign in and your next match can move your Quick Match rating.'],
  ] as const)('%s: builds the text from that match', async (_, args, text) => {
    await guestResults(args);
    expect(within(prompt()).getByText(text)).toBeInTheDocument();
  });

  it('is an inline card between the results band and the breakdown, never a modal, and the only nudge', async () => {
    await guestResults({ you: 7840, rival: { name: 'Rahul', kind: 'GUEST', score: 3000 } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryAllByTestId('sign-in-nudge')).toHaveLength(0);
    const order = Array.from(document.querySelectorAll('[data-testid="results-sign-in-prompt"], [data-testid="breakdown"], main > h1'));
    expect(order.map((el) => el.getAttribute('data-testid') ?? 'heading')).toEqual(['heading', 'results-sign-in-prompt', 'breakdown']);
    expect(within(prompt()).getByRole('button', { name: 'Continue with Google' })).not.toHaveAttribute('aria-disabled');
  });

  it('renders the Malayalam variants with the score and the opponent name unchanged', async () => {
    await act(() => i18n.changeLanguage('ml'));
    const node = await guestResults({ you: 3000, rival: { name: 'Rahul Menon', kind: 'GUEST', score: 6200 } });
    expect(node.textContent).toContain('Rahul Menon ജയിച്ചു.');
    expect(node.textContent).toContain('3,000');
    expect(node.textContent).not.toMatch(/\{\{|undefined/);
  });

  it('a stored result from before the flag existed decides from the session, never as registered', async () => {
    stubFetch();
    restartGuestSession();
    storeResult({ you: 7840, rival: { name: 'Rahul', kind: 'GUEST', score: 3000 }, guest: true });
    const raw = JSON.parse(window.sessionStorage.getItem(lastResult.LAST_RESULT_KEY)!);
    delete raw.guest;
    window.sessionStorage.setItem(lastResult.LAST_RESULT_KEY, JSON.stringify(raw));
    renderApp('/results');
    expect(await screen.findByTestId('results-sign-in-prompt')).toBeInTheDocument();
  });

  it('shows identical text after a reload (rebuilt from the stored result)', async () => {
    const first = (await guestResults({ you: 3000, rival: { name: 'Rahul', kind: 'GUEST', score: 6200 } })).textContent;
    cleanup();
    resetRealtime();
    renderApp('/results');
    expect((await screen.findByTestId('results-sign-in-prompt')).textContent).toBe(first);
  });

  it.each([
    ['cancelled', 'Sign-in cancelled', 'status'],
    ['failed', "Sign-in didn't work. Please try again.", 'alert'],
  ])('shows the "%s" sign-in note inside the card, once, and takes ?signin= out of the address', async (outcome, text, role) => {
    stubFetch();
    restartGuestSession();
    storeResult({ you: 7840, rival: { name: 'Rahul', kind: 'GUEST', score: 3000 }, guest: true });
    renderApp(`/results?signin=${outcome}`);
    const card = await screen.findByTestId('results-sign-in-prompt');
    const note = within(card).getByTestId('signin-outcome');
    expect(note).toHaveTextContent(text);
    expect(note).toHaveAttribute('role', role);
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(within(prompt()).getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('shows no sign-in note when she did not come back from a sign-in', async () => {
    await guestResults({ you: 7840, rival: { name: 'Rahul', kind: 'GUEST', score: 3000 } });
    expect(screen.queryByTestId('signin-outcome')).toBeNull();
  });

  it('starts the Google sign-in for the whole page with returnTo=/results and nothing about the match', async () => {
    const user = userEvent.setup();
    await guestResults({ you: 7840, rival: { name: 'Rahul', kind: 'GUEST', score: 3000 } });
    const assign = vi.spyOn(pageNavigation, 'assign').mockImplementation(() => undefined);
    await user.click(within(prompt()).getByRole('button', { name: 'Continue with Google' }));
    expect(assign).toHaveBeenCalledExactlyOnceWith('/api/core/v1/auth/google/start?returnTo=%2Fresults');
    const url = assign.mock.calls[0]![0];
    expect(url).not.toMatch(/m-guest|7840|Guest|score|match/i);
  });
});

describe('after signing in', () => {
  function registeredCore() {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, body: String(init?.body ?? '') });
        if (url === REFRESH_PATH) {
          return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
        }
        if (url === PROFILE_PATH) {
          return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
        }
        if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
        return jsonResponse({ status: 404 }, 404, 'application/problem+json');
      }),
    );
    return calls;
  }

  it('drops the prompt, shows a muted guest-match note, no rating delta, and Play again instead of Rematch', async () => {
    const user = userEvent.setup();
    const calls = registeredCore();
    storeResult({ you: 7840, rival: { name: 'Rahul', kind: 'GUEST', score: 3000 }, guest: true });
    session.start();
    await session.ready();
    renderApp('/results');

    expect(await screen.findByTestId('guest-match-note')).toHaveTextContent('You played this match as a guest, so it is not on your record.');
    expect(screen.queryByTestId('results-sign-in-prompt')).toBeNull();
    expect(screen.queryByTestId('rematch-button')).toBeNull();
    expect(screen.queryAllByText(/rating/i)).toEqual([]);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());

    await user.click(screen.getByTestId('play-again-button'));
    expect(window.location.pathname).toBe('/matchmaking');
    // Nothing about the guest match or the guest id was sent anywhere.
    for (const call of calls) expect(`${call.url} ${call.body}`).not.toMatch(/m-guest|Guest 4821|"me"|7840/);
  });

  it('shows no prompt and keeps Rematch for a registered player’s own match', async () => {
    registeredCore();
    storeResult({ you: 7840, rival: { name: 'Rahul', kind: 'USER', score: 3000 }, guest: false });
    session.start();
    await session.ready();
    renderApp('/results');
    expect(await screen.findByTestId('rematch-button')).toBeInTheDocument();
    expect(screen.queryByTestId('results-sign-in-prompt')).toBeNull();
    expect(screen.queryByTestId('guest-match-note')).toBeNull();
    expect(screen.queryByTestId('play-again-button')).toBeNull();
  });

  it('shows nothing yet while the session is still booting', async () => {
    let release: (response: Response) => void = () => undefined;
    const gate = new Promise<Response>((resolve) => (release = resolve));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (String(input) === REFRESH_PATH ? gate : jsonResponse(guestTokenBody('en')))));
    storeResult({ you: 7840, rival: { name: 'Rahul', kind: 'GUEST', score: 3000 }, guest: true });
    session.start(); // the refresh is still in flight
    renderApp('/results');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('results-sign-in-prompt')).toBeNull();
    expect(screen.queryByTestId('guest-match-note')).toBeNull();
    release(jsonResponse({ status: 401 }, 401, 'application/problem+json'));
    await waitFor(() => expect(screen.getByTestId('results-sign-in-prompt')).toBeInTheDocument());
  });
});
