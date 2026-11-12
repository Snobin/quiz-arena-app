import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import i18n from '../../i18n.ts';
import { jsonResponse, restartGuestSession, stubFetch } from '../../test-utils/guest.ts';
import { resetAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { useFakeRealtime } from '../../test-utils/realtime.ts';

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

const quickMatch = () => screen.getByRole('button', { name: 'Quick Match' });
const ROW_NAMES = [
  'Topic Duel, locked, sign in to play',
  'Solo Practice, locked, sign in to play',
  'Battle Room, locked, sign in to play',
];

let online = true;

beforeEach(async () => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
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
  await act(() => i18n.changeLanguage('ml'));
});

async function homeReady() {
  stubFetch();
  restartGuestSession();
  renderApp('/');
  await waitFor(() => expect(quickMatch()).not.toHaveAttribute('aria-disabled'));
}

describe('guest Home structure', () => {
  it('one ink card, one nudge before 3 locked rows, no rank or ratings, no volt', async () => {
    await homeReady();
    expect(screen.getByRole('heading', { level: 1, name: 'Playing as guest' })).toBeInTheDocument();
    expect(document.title).toBe('Home · Minnal');

    const main = screen.getByRole('main');
    // The Quick Match card is the only filled ink (band) element.
    const ink = main.querySelectorAll('.surface-band, .bg-band, .bg-ink');
    expect(ink).toHaveLength(1);
    expect(ink[0]).toBe(quickMatch());
    expect(quickMatch()).toHaveAccessibleDescription('10 questions · 15 s each · about 4 min');
    expect(within(quickMatch()).getByText('Play now →')).toHaveAttribute('aria-hidden', 'true');
    expect(quickMatch().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(quickMatch().querySelector('svg')).toHaveClass('fill-band-raised');
    expect(within(quickMatch()).queryAllByRole('button')).toHaveLength(0);
    expect(quickMatch().className).toContain('min-h-target-min');

    const nudges = screen.getAllByTestId('sign-in-nudge');
    expect(nudges).toHaveLength(1);
    const google = within(nudges[0]!).getByRole('button', { name: 'Continue with Google' });
    expect(google.className).toContain('border-ink');
    expect(google.className).not.toContain('bg-band');

    const rows = ROW_NAMES.map((name) => screen.getByRole('link', { name }));
    for (const row of rows) {
      expect(row).toHaveAttribute('href', '/sign-in?returnTo=/');
      expect(row.className).toContain('min-h-target-min');
      expect(row.querySelector('.opacity-50')).not.toBeNull();
      expect(within(row).getByText('Sign in')).toBeInTheDocument();
    }
    // Order: Quick Match, nudge, rows.
    const order = [quickMatch(), nudges[0]!, ...rows];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    // No rank snippet ("#212 Kerala today") and no rating trio ("Your rating").
    expect(main.textContent).not.toMatch(/#\d|Your rating\b(?!s)|today/i);
    expect(main.innerHTML).not.toMatch(/volt/);
  });

  it('first boot on a Malayalam phone: Malayalam UI, <html lang="ml">, one guest request with lang ml', async () => {
    await act(() => i18n.changeLanguage('ml'));
    const fetchMock = stubFetch();
    restartGuestSession();
    renderApp('/');
    expect(document.documentElement.lang).toBe('ml');
    expect(screen.getByRole('heading', { level: 1, name: 'അതിഥിയായി കളിക്കുന്നു' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'ക്വിക്ക് മാച്ച്' })).not.toHaveAttribute('aria-disabled'));
    const guestCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/guest'));
    expect(guestCalls).toHaveLength(1);
    expect(JSON.parse(String(guestCalls[0]![1]?.body))).toEqual({ lang: 'ml' });
    expect(screen.getByRole('link', { name: 'ടോപ്പിക് ഡ്യുവൽ, ലോക്ക് ചെയ്തിരിക്കുന്നു, കളിക്കാൻ സൈൻ ഇൻ ചെയ്യൂ' })).toBeInTheDocument();
  });
});

describe('Quick Match', () => {
  it('one tap goes to matchmaking (tab bar hidden); Cancel before the socket opens returns Home', async () => {
    const user = userEvent.setup();
    const sockets = useFakeRealtime();
    await homeReady();
    await user.click(quickMatch());
    expect(window.location.pathname).toBe('/matchmaking');
    expect(screen.getByRole('heading', { level: 1, name: 'Finding an opponent…' })).toHaveFocus();
    expect(document.title).toBe('Matchmaking · Minnal');
    expect(screen.queryByRole('navigation')).toBeNull();
    await waitFor(() => expect(sockets).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('is aria-disabled with a caption while there is no token, and a tap does nothing', async () => {
    const user = userEvent.setup();
    stubFetch(() => new Promise<Response>(() => {}));
    restartGuestSession();
    renderApp('/');
    expect(quickMatch()).toHaveAttribute('aria-disabled', 'true');
    expect(quickMatch()).toHaveAccessibleDescription(expect.stringContaining('Setting up your guest session…'));
    await user.click(quickMatch());
    expect(window.location.pathname).toBe('/');
  });

  it('is aria-disabled with the offline caption when offline', async () => {
    const user = userEvent.setup();
    await homeReady();
    act(() => {
      online = false;
      window.dispatchEvent(new Event('offline'));
    });
    expect(quickMatch()).toHaveAttribute('aria-disabled', 'true');
    expect(quickMatch()).toHaveAccessibleDescription(expect.stringContaining('Playing needs an internet connection'));
    await user.click(quickMatch());
    expect(window.location.pathname).toBe('/');
  });
});

describe('token failure', () => {
  it.each([
    ['server', () => jsonResponse({ status: 500 }, 500, 'application/problem+json'), "Minnal couldn't start your guest session. Try again in a moment."],
    [
      'network',
      () => {
        throw new TypeError('Failed to fetch');
      },
      "Couldn't reach Minnal. Check your connection and try again.",
    ],
  ])('%s: inline alert with the reason and Retry; Retry refetches', async (_, fail, text) => {
    const user = userEvent.setup();
    let failing = true;
    const fetchMock = stubFetch((init) => {
      if (failing) return fail();
      const { lang } = JSON.parse(String(init?.body)) as { lang: string };
      return jsonResponse({ accessToken: 'h.' + btoa(JSON.stringify({ lang })) + '.s', expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    });
    restartGuestSession();
    renderApp('/');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(quickMatch()).toHaveAttribute('aria-disabled', 'true');
    // Home still renders around the alert.
    expect(screen.getAllByRole('link', { name: /locked/ })).toHaveLength(3);

    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(quickMatch()).not.toHaveAttribute('aria-disabled');
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/guest'))).toHaveLength(2);
  });
});

describe('wake re-check', () => {
  it('after a network error, coming back online refetches and clears the alert', async () => {
    let failing = true;
    online = false;
    const fetchMock = stubFetch((init) => {
      if (failing) throw new TypeError('Failed to fetch');
      const { lang } = JSON.parse(String(init?.body)) as { lang: string };
      return jsonResponse({ accessToken: 'h.' + btoa(JSON.stringify({ lang })) + '.s', expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    });
    restartGuestSession();
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Minnal.");
    const guestCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/guest'));
    expect(guestCalls()).toHaveLength(1);

    failing = false;
    act(() => {
      online = true;
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(guestCalls()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(quickMatch()).not.toHaveAttribute('aria-disabled');
  });
});

describe('Sign-in prompt', () => {
  it('locked row → /sign-in?returnTo=/ (not a modal); Google aria-disabled with caption; Back → Home, focus on the row', async () => {
    const user = userEvent.setup();
    await homeReady();
    await user.click(screen.getByRole('link', { name: ROW_NAMES[0] }));

    expect(window.location.pathname).toBe('/sign-in');
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to Minnal' })).toHaveFocus();
    expect(document.title).toBe('Sign in · Minnal');
    expect(screen.getByText(/need a free account/)).toBeInTheDocument();
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    expect(google).toHaveAttribute('aria-disabled', 'true');
    expect(google).toHaveAccessibleDescription('Google sign-in is coming soon');
    // The tab bar stays (inside the shell), with Play active.
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('link', { name: 'Back' }));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    await waitFor(() => expect(screen.getByRole('link', { name: ROW_NAMES[0] })).toHaveFocus());
  });

  it("the nudge's button opens the prompt; browser Back returns focus to it", async () => {
    const user = userEvent.setup();
    await homeReady();
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(window.location.pathname).toBe('/sign-in');
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveFocus());
  });

  it('a return target is dropped after a detour elsewhere', async () => {
    const user = userEvent.setup();
    await homeReady();
    await user.click(screen.getByRole('link', { name: ROW_NAMES[2] }));
    await user.click(screen.getByRole('link', { name: 'Rooms' }));
    await user.click(screen.getByRole('link', { name: 'Play' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Playing as guest' })).toHaveFocus();
  });

  it('on a direct load, Back navigates to returnTo', async () => {
    const user = userEvent.setup();
    stubFetch();
    restartGuestSession();
    renderApp('/sign-in?returnTo=/rooms');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/rooms');
    await user.click(screen.getByRole('link', { name: 'Back' }));
    expect(window.location.pathname).toBe('/rooms');
  });

  it('never returns outside the app', () => {
    stubFetch();
    restartGuestSession();
    renderApp('/sign-in?returnTo=//evil.example/x');
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/');
  });
});
