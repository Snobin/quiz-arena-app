import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import i18n from '../../i18n.ts';
import { useReduceEffectsStore } from '../../motion/reduceEffects.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { restartGuestSession, stubFetch } from '../../test-utils/guest.ts';
import {
  CANCEL,
  JOIN,
  MATCHMAKING_CANCELLED,
  MATCHMAKING_FAILED,
  matchFound,
  serverError,
  useFakeRealtime,
  type FakeStomp,
} from '../../test-utils/realtime.ts';

// fontsReady() is controlled per test: by default it is already settled.
let releaseFonts: () => void = () => {};
let fontsPromise: Promise<void> = Promise.resolve();
vi.mock('../../design/fonts.ts', async (original) => ({
  ...(await original<typeof import('../../design/fonts.ts')>()),
  fontsReady: () => fontsPromise,
}));

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

let clients: FakeStomp[];
const socket = () => clients[clients.length - 1]!;
const heading = () => screen.getByRole('heading', { level: 1 });

/** Opens /matchmaking and lets the (fake) socket connect. */
async function searching(path = '/matchmaking') {
  renderApp(path);
  await waitFor(() => expect(clients).toHaveLength(1));
  act(() => socket().open());
  expect(socket().sentTo(JOIN)).toBe(1);
}

beforeEach(async () => {
  stubFetch();
  restartGuestSession();
  clients = useFakeRealtime();
  fontsPromise = Promise.resolve();
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  resetRealtime();
  guestSession.reset();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  useReduceEffectsStore.setState({ setting: 'follow-phone', osReduced: false, fallback: null });
  await act(() => i18n.changeLanguage('ml'));
});

describe('searching', () => {
  it('joins on mount and shows the heading, an animated indicator and a 48px Cancel; no tab bar', async () => {
    await searching();
    expect(heading()).toHaveTextContent('Finding an opponent…');
    expect(document.title).toBe('Matchmaking · Minnal');
    expect(screen.getByTestId('matchmaking-indicator')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('matchmaking-elapsed')).toBeNull();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.className).toContain('min-h-target-min');
    expect(cancel.className).toContain('border-ink'); // secondary
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reduced effects: static text plus an elapsed-seconds count, no animation', async () => {
    useReduceEffectsStore.setState({ setting: 'on' });
    await searching();
    expect(screen.queryByTestId('matchmaking-indicator')).toBeNull();
    expect(screen.getByTestId('matchmaking-elapsed')).toHaveTextContent('0 s');
    expect(document.querySelector('.animate-pulse')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('matchmaking-elapsed')).toHaveTextContent('1 s'), { timeout: 2500 });
  });

  it('a Quick Match tap from Home lands here with focus on the heading', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const quickMatch = screen.getByRole('button', { name: 'Quick Match' });
    await waitFor(() => expect(quickMatch).not.toHaveAttribute('aria-disabled'));
    await user.click(quickMatch);
    expect(window.location.pathname).toBe('/matchmaking');
    expect(heading()).toHaveFocus();
    await waitFor(() => expect(clients).toHaveLength(1));
    expect(socket().authorization).toMatch(/^Bearer .+\..+\..+$/);
  });
});

describe('found', () => {
  it('a bot: "Minnal Bot joined" with the BOT badge, announced once, then the /match stub', async () => {
    await searching();
    act(() => socket().deliver(matchFound({ name: 'Minnal Bot', kind: 'BOT' })));
    expect(heading()).toHaveTextContent('Minnal Bot joined');
    const badge = within(heading()).getByTestId('bot-badge');
    expect(badge).toHaveTextContent('BOT');
    expect(within(badge).getByText('BOT')).toHaveAttribute('lang', 'en');
    expect(badge.className).toContain('rounded-sm');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Minnal Bot joined'));
    expect(useAnnouncements.getState().polite.seq).toBe(1);

    await waitFor(() => expect(window.location.pathname).toBe('/match'), { timeout: 2500 });
    expect(useAnnouncements.getState().polite.seq).toBe(1);
    expect(heading()).toHaveTextContent('Match found · vs Minnal Bot');
    expect(within(heading()).getByTestId('bot-badge')).toBeInTheDocument();
    expect(document.title).toBe('Match · Minnal');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('a human: the name (no badge), and /match replaces the matchmaking entry', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const quickMatch = screen.getByRole('button', { name: 'Quick Match' });
    await waitFor(() => expect(quickMatch).not.toHaveAttribute('aria-disabled'));
    await user.click(quickMatch);
    await waitFor(() => expect(clients).toHaveLength(1));
    act(() => socket().open());
    act(() => socket().deliver(matchFound({ name: 'Vishnu R', kind: 'GUEST' })));
    expect(heading()).toHaveTextContent('Match found · vs Vishnu R');
    expect(screen.queryByTestId('bot-badge')).toBeNull();
    await waitFor(() => expect(window.location.pathname).toBe('/match'), { timeout: 2500 });
    // Back skips the finished matchmaking screen.
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('waits for fonts as well as the 1 s hold', async () => {
    fontsPromise = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    await searching();
    act(() => socket().deliver(matchFound({ name: 'Minnal Bot', kind: 'BOT' })));
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(window.location.pathname).toBe('/matchmaking');
    act(() => releaseFonts());
    await waitFor(() => expect(window.location.pathname).toBe('/match'));
  });

  it('holds 1 s even when fonts are ready at once', async () => {
    await searching();
    act(() => socket().deliver(matchFound({ name: 'Minnal Bot', kind: 'BOT' })));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(window.location.pathname).toBe('/matchmaking');
    await waitFor(() => expect(window.location.pathname).toBe('/match'), { timeout: 2000 });
  });

  it('Malayalam: the bot line in Malayalam, a Latin name marked lang="en"', async () => {
    await act(() => i18n.changeLanguage('ml'));
    await searching();
    act(() => socket().deliver(matchFound({ name: 'Minnal Bot', kind: 'BOT' })));
    expect(heading()).toHaveTextContent('മിന്നൽ ബോട്ട് ചേർന്നു');
    await waitFor(() => expect(window.location.pathname).toBe('/match'), { timeout: 2500 });
    expect(within(heading()).getByText('Minnal Bot')).toHaveAttribute('lang', 'en');
  });
});

describe('failures', () => {
  it('MATCHMAKING_FAILED: the reason and Retry, which joins again', async () => {
    const user = userEvent.setup();
    await searching();
    act(() => socket().deliver(MATCHMAKING_FAILED));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't start the match. Try again.");
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(socket().sentTo(JOIN)).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(heading()).toHaveTextContent('Finding an opponent…');
  });

  it('a connection failure: the reason and Retry, which opens a new socket', async () => {
    const user = userEvent.setup();
    renderApp('/matchmaking');
    await waitFor(() => expect(clients).toHaveLength(1));
    act(() => socket().drop());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't connect to Minnal.");
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(clients).toHaveLength(2));
  });

  it('SERVER_DRAINING: the one-line notice and Retry', async () => {
    await searching();
    act(() => socket().deliver(serverError('SERVER_DRAINING')));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Minnal is updating. Try again in a moment.');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('ALREADY_IN_MATCH with a matchId offers "Back to your match"', async () => {
    const user = userEvent.setup();
    await searching();
    act(() => socket().deliver(serverError('ALREADY_IN_MATCH', crypto.randomUUID())));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("You're already in a match.");
    await user.click(within(alert).getByRole('button', { name: 'Back to your match' }));
    expect(window.location.pathname).toBe('/match');
    expect(new URLSearchParams(window.location.search).get('matchId')).toBeTruthy();
    // This tab never saw the match itself.
    expect(screen.getByText("There's no match on this screen.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('"Back to your match" never shows a different (stale) match from the store', async () => {
    const user = userEvent.setup();
    await searching();
    act(() => socket().deliver(matchFound({ name: 'Old Rival', kind: 'GUEST' })));
    await waitFor(() => expect(window.location.pathname).toBe('/match'), { timeout: 2500 });
    expect(heading()).toHaveTextContent('Old Rival');
    await user.click(screen.getByRole('link', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: 'Quick Match' }));
    act(() => socket().deliver(serverError('ALREADY_IN_MATCH', crypto.randomUUID())));
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Back to your match' }));
    expect(window.location.pathname).toBe('/match');
    expect(screen.getByText("There's no match on this screen.")).toBeInTheDocument();
    expect(screen.queryByText('Old Rival')).toBeNull();
  });

  it('"Back to your match" shows the store match when it is that match', async () => {
    const user = userEvent.setup();
    await searching();
    const found = matchFound({ name: 'Same Rival', kind: 'GUEST' });
    act(() => socket().deliver(found));
    await waitFor(() => expect(window.location.pathname).toBe('/match'), { timeout: 2500 });
    await user.click(screen.getByRole('link', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: 'Quick Match' }));
    act(() => socket().deliver(serverError('ALREADY_IN_MATCH', found.matchId)));
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Back to your match' }));
    expect(heading()).toHaveTextContent('Match found · vs Same Rival');
  });

  it('ALREADY_IN_MATCH without one: already searching elsewhere', async () => {
    await searching();
    act(() => socket().deliver(serverError('ALREADY_IN_MATCH')));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("You're already searching on another tab or device.");
    expect(within(alert).queryByRole('button')).toBeNull();
  });
});

describe('cancel', () => {
  it('sends cancel and goes Home on MATCHMAKING_CANCELLED', async () => {
    const user = userEvent.setup();
    await searching();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(socket().sentTo(CANCEL)).toBe(1);
    expect(window.location.pathname).toBe('/matchmaking');
    act(() => socket().deliver(MATCHMAKING_CANCELLED));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('before the socket opens: closes the attempt and goes Home at once', async () => {
    const user = userEvent.setup();
    renderApp('/matchmaking');
    await waitFor(() => expect(clients).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(window.location.pathname).toBe('/');
    expect(socket().deactivations).toBe(1);
    expect(socket().published).toEqual([]);
  });

  it('leaving the route while searching (browser Back) sends cancel', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const quickMatch = screen.getByRole('button', { name: 'Quick Match' });
    await waitFor(() => expect(quickMatch).not.toHaveAttribute('aria-disabled'));
    await user.click(quickMatch);
    await waitFor(() => expect(clients).toHaveLength(1));
    act(() => socket().open());
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(socket().sentTo(CANCEL)).toBe(1);
  });

  it('a stale result from the last visit does not open /match again', async () => {
    await searching();
    act(() => socket().deliver(matchFound({ name: 'Minnal Bot', kind: 'BOT' })));
    await waitFor(() => expect(window.location.pathname).toBe('/match'), { timeout: 2500 });
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Home' }));
    await user.click(screen.getByRole('button', { name: 'Quick Match' }));
    expect(window.location.pathname).toBe('/matchmaking');
    expect(heading()).toHaveTextContent('Finding an opponent…');
    expect(socket().sentTo(JOIN)).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    expect(window.location.pathname).toBe('/matchmaking');
  });
});

describe('/match stub', () => {
  it('with no match in the store: a "no match" line and Home', async () => {
    const user = userEvent.setup();
    renderApp('/match');
    expect(heading()).toHaveTextContent('Match');
    expect(screen.getByText("There's no match on this screen.")).toBeInTheDocument();
    expect(document.title).toBe('Match · Minnal');
    expect(screen.queryByRole('navigation')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Home' }));
    expect(window.location.pathname).toBe('/');
  });
});
