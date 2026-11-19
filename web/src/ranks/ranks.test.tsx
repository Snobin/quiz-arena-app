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
import { navigate, syncFromLocation } from '../shell/router.ts';
import { clearScrollMemory } from '../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../test-utils/guest.ts';
import { boardPath, type Board, type BoardEntry } from './leaderboardApi.ts';
import { resetRanksSelection } from './ranksSelection.ts';

const ME = '00000000-0000-0000-0000-0000000000aa';

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

let nextId = 1;
/** Every entry is a different player, even when two share a rank. */
const entry = (rank: number, name: string, district: string, value: number, userId = `00000000-0000-0000-0001-${String(nextId++).padStart(12, '0')}`): BoardEntry => ({
  rank,
  userId,
  displayName: name,
  district,
  value,
});

const DAILY: BoardEntry[] = [entry(1, 'Anju', 'thrissur', 142), entry(2, 'Biju', 'kollam', 80), entry(2, 'Meera', 'kannur', 80), entry(4, 'അഞ്ജു', 'wayanad', -18)];

function core({ registered, board }: { registered: boolean; board?: (mode: string, period: string, offset: number) => Partial<Board> | Response | Promise<Partial<Board>> }) {
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) {
        return registered
          ? jsonResponse({ accessToken: utf8Jwt({ name: 'Anju', sub: ME }), expiresAt: new Date(Date.now() + 3600_000).toISOString() })
          : jsonResponse({ status: 401 }, 401, 'application/problem+json');
      }
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      if (url.startsWith('/api/ratings/v1/leaderboards/')) {
        paths.push(url);
        const [, mode, period] = /leaderboards\/(\w+)\/(\w+)\?offset=(\d+)/.exec(url) ?? [];
        const offset = Number(/offset=(\d+)/.exec(url)![1]);
        const result = await (board ?? (() => ({ entries: DAILY })))(mode!, period!, offset);
        if (result instanceof Response) return result;
        return jsonResponse({ mode, period, periodKey: 'k', measure: period === 'alltime' ? 'RATING' : 'RATING_GAINED', entries: [], ...result });
      }
      return jsonResponse({ ratings: [], matches: [] });
    }),
  );
  return paths;
}

async function boot() {
  session.start();
  await session.ready();
}

beforeEach(async () => {
  resetRanksSelection();
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

describe('Ranks: the board', () => {
  it('shows the mode switcher over the period tabs, a header naming the measure, and rows with competition ranks', async () => {
    core({ registered: false });
    await boot();
    renderApp('/ranks');

    const modes = screen.getByRole('radiogroup');
    expect(within(modes).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Quick Match', 'Topic Duel', 'Battle Room']);
    expect(within(modes).getByRole('radio', { name: 'Quick Match' })).toBeChecked();
    expect(within(modes).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    const tabs = screen.getByRole('tablist');
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Today', 'This week', 'All time']);
    expect(within(tabs).getByRole('tab', { name: 'Today', selected: true })).toBeInTheDocument();
    for (const control of [...within(modes).getAllByRole('radio'), ...within(tabs).getAllByRole('tab')]) expect(control.className).toMatch(/min-h-target-min/);

    const rows = await screen.findAllByTestId('rank-row');
    expect(screen.getByTestId('ranks-header')).toHaveTextContent('rating gained today');
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      '1, Anju, Thrissur, +142',
      '2, Biju, Kollam, +80',
      '2, Meera, Kannur, +80',
      '4, അഞ്ജു, Wayanad, -18',
    ]);
    // Ranks 1 to 3 are bold ink numerals; the rest muted. No volt anywhere.
    expect(rows[0]!.querySelector('span')!.className).toMatch(/font-bold/);
    expect(rows[3]!.querySelector('span')!.className).toMatch(/text-muted/);
    expect(document.querySelector('[data-accent]')).toBeNull();
  });

  it('switching mode or period swaps the list and keeps the choice when she leaves the tab and comes back', async () => {
    const user = userEvent.setup();
    const paths = core({
      registered: false,
      board: (mode, period) => ({ entries: [entry(1, `${mode}-${period}`, 'thrissur', period === 'alltime' ? 1912 : 7)] }),
    });
    await boot();
    renderApp('/ranks');
    await screen.findByText('QUICK-daily');

    await user.click(screen.getByRole('radio', { name: 'Topic Duel' }));
    await screen.findByText('TOPIC_DUEL-daily');
    await user.click(screen.getByRole('tab', { name: 'All time' }));
    await screen.findByText('TOPIC_DUEL-alltime');
    expect(screen.getByTestId('ranks-header')).toHaveTextContent('rating');
    expect(screen.getByTestId('ranks-header')).not.toHaveTextContent('gained');
    expect(screen.getByTestId('rank-row')).toHaveAttribute('aria-label', '1, TOPIC_DUEL-alltime, Thrissur, 1,912');
    expect(paths.some((p) => p === boardPath('TOPIC_DUEL', 'alltime', 0, 50))).toBe(true);

    act(() => navigate('/'));
    act(() => navigate('/ranks'));
    expect(screen.getByRole('radio', { name: 'Topic Duel' })).toBeChecked();
    expect(screen.getByRole('tab', { name: 'All time', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('TOPIC_DUEL-alltime')).toBeInTheDocument();
  });

  it('lists the next 50 on "Show more" (top 100 only)', async () => {
    const user = userEvent.setup();
    const page = (offset: number) => Array.from({ length: 50 }, (_, i) => entry(offset + i + 1, `P${offset + i + 1}`, 'thrissur', 100 - offset - i));
    const paths = core({ registered: false, board: (_m, _p, offset) => ({ entries: page(offset) }) });
    await boot();
    renderApp('/ranks');
    expect(await screen.findAllByTestId('rank-row')).toHaveLength(50);
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(screen.getAllByTestId('rank-row')).toHaveLength(100));
    expect(paths).toContain(boardPath('QUICK', 'daily', 50, 50));
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('a failed board shows an inline retry with the reason and the rest of the page works', async () => {
    const user = userEvent.setup();
    let failing = true;
    core({ registered: false, board: () => (failing ? jsonResponse({ status: 500 }, 500, 'application/problem+json') : { entries: DAILY }) });
    await boot();
    renderApp('/ranks');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this: the server had a problem.");
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByTestId('rank-row')).toHaveLength(4);
  });
});

describe('Ranks: more behaviours', () => {
  it('moves along the mode switcher and the period tabs with the arrow keys (one tab stop each)', async () => {
    const user = userEvent.setup();
    core({ registered: false });
    await boot();
    renderApp('/ranks');
    await screen.findAllByTestId('rank-row');
    const quick = screen.getByRole('radio', { name: 'Quick Match' });
    expect(quick).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Topic Duel' })).toHaveAttribute('tabindex', '-1');
    quick.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Topic Duel' })).toBeChecked();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Battle Room' })).toBeChecked(); // wraps around
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Battle Room' })).toHaveFocus()); // focus follows the selection

    screen.getByRole('tab', { name: 'Today' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'This week', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'ranks-tab-weekly');
    expect(screen.getByRole('tab', { name: 'This week' })).toHaveAttribute('aria-controls', 'ranks-panel');
  });

  it('shows the weekly board with its own header and empty line', async () => {
    const user = userEvent.setup();
    core({ registered: false, board: (_m, period) => (period === 'weekly' ? { entries: [] } : { entries: DAILY }) });
    await boot();
    renderApp('/ranks');
    await user.click(await screen.findByRole('tab', { name: 'This week' }));
    expect(await screen.findByTestId('empty-board')).toHaveTextContent("No one's on this week's board yet. The first win takes the top spot.");
    expect(screen.getByTestId('ranks-header')).toHaveTextContent('rating gained this week');
  });

  it('does not ask for the next page of a board it was not pressed on, shows loading on the button, and never lists a player twice', async () => {
    const user = userEvent.setup();
    const firstPage = Array.from({ length: 50 }, (_, i) => entry(i + 1, `P${i + 1}`, 'thrissur', 100));
    let release: (board: Partial<Board>) => void = () => undefined;
    const gate = new Promise<Partial<Board>>((resolve) => (release = resolve));
    const paths = core({
      registered: false,
      board: (_m, _p, offset) => (offset === 0 ? { entries: firstPage } : gate),
    });
    await boot();
    renderApp('/ranks');
    await screen.findAllByTestId('rank-row');
    await user.click(screen.getByRole('radio', { name: 'Topic Duel' })); // before any "Show more"
    await screen.findAllByTestId('rank-row');
    expect(paths.filter((p) => p.includes('offset=50'))).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByRole('button', { name: 'Loading…' })).toHaveAttribute('aria-busy', 'true');
    // The second page repeats one player of the first (ranks shifted between the requests).
    release({ entries: [firstPage[49]!, entry(51, 'P51', 'thrissur', 99)] });
    await waitFor(() => expect(screen.getAllByTestId('rank-row')).toHaveLength(51));
    expect(screen.queryByRole('button', { name: /Show more|Loading/ })).toBeNull();
  });

  it('a guest who signs in does not keep the guest board (no position) in view', async () => {
    core({ registered: false, board: () => ({ entries: DAILY }) });
    await boot();
    renderApp('/ranks');
    await screen.findAllByTestId('rank-row');
    expect(screen.queryByTestId('pinned-row')).toBeNull();
    // Her session comes up as registered: the board is fetched again for her (its own cache entry, with `me`).
    core({ registered: true, board: () => ({ entries: DAILY, me: { rank: 9, value: 5 } }) });
    session.reset();
    session.start();
    await session.ready();
    expect(await screen.findByTestId('pinned-row')).toHaveTextContent('9');
  });

  it('the Home snippet shows an inline retry when the board fails', async () => {
    const user = userEvent.setup();
    let failing = true;
    core({ registered: true, board: () => (failing ? jsonResponse({ status: 500 }, 500, 'application/problem+json') : { entries: DAILY, me: { rank: 2, value: 10 } }) });
    await boot();
    renderApp('/');
    const alert = await screen.findByRole('alert');
    failing = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('rank-snippet-rank')).toHaveTextContent('2');
  });
});

describe('Ranks: guests and registered players', () => {
  it('a guest reads the boards with no pinned row and no "You" tag, and sees exactly one Sign-in nudge below the list', async () => {
    core({ registered: false });
    await boot();
    renderApp('/ranks');
    await screen.findAllByTestId('rank-row');
    expect(screen.queryByTestId('pinned-row')).toBeNull();
    expect(screen.queryByTestId('own-tag')).toBeNull();
    const nudges = screen.getAllByTestId('sign-in-nudge');
    expect(nudges).toHaveLength(1);
    expect(screen.getByTestId('board').compareDocumentPosition(nudges[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a registered player whose row is in the list sees it tagged in place, with no nudge and nothing pinned', async () => {
    core({ registered: true, board: () => ({ entries: [entry(1, 'Biju', 'kollam', 80), entry(2, 'Anju', 'thrissur', 42, ME)], me: { rank: 2, value: 42 } }) });
    await boot();
    renderApp('/ranks');
    const own = (await screen.findAllByTestId('rank-row')).find((r) => r.getAttribute('data-own') === 'true')!;
    expect(within(own).getByTestId('own-tag')).toHaveTextContent('You');
    expect(screen.queryByTestId('pinned-row')).toBeNull();
    expect(screen.queryByTestId('sign-in-nudge')).toBeNull();
  });

  it('pins her row above the tab bar when it is beyond the listed rows, with the gap mark, tag, district and value', async () => {
    core({ registered: true, board: () => ({ entries: DAILY, me: { rank: 120, value: -7 } }) });
    await boot();
    renderApp('/ranks');
    const pinned = await screen.findByTestId('pinned-row');
    expect(pinned).toHaveTextContent('···');
    expect(within(pinned).getByTestId('own-tag')).toHaveTextContent('You');
    expect(pinned).toHaveTextContent('Anju');
    expect(pinned).toHaveTextContent('Thrissur');
    expect(pinned).toHaveTextContent('120');
    expect(pinned).toHaveTextContent('-7');
    expect(pinned.className).toMatch(/fixed/);
  });

  it('shows no pinned row when she has no position (me is null)', async () => {
    core({ registered: true, board: () => ({ entries: DAILY, me: null }) });
    await boot();
    renderApp('/ranks');
    await screen.findAllByTestId('rank-row');
    expect(screen.queryByTestId('pinned-row')).toBeNull();
  });

  it('unpins when her own row scrolls into view and pins again when it leaves', async () => {
    let notify: (isIntersecting: boolean) => void = () => undefined;
    class FakeObserver {
      constructor(callback: (records: { isIntersecting: boolean }[]) => void) {
        notify = (isIntersecting) => callback([{ isIntersecting }]);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    core({ registered: true, board: () => ({ entries: [entry(1, 'Biju', 'kollam', 80), entry(2, 'Anju', 'thrissur', 42, ME)], me: { rank: 2, value: 42 } }) });
    await boot();
    renderApp('/ranks');
    await screen.findAllByTestId('rank-row');

    act(() => notify(false));
    expect(await screen.findByTestId('pinned-row')).toBeInTheDocument();
    act(() => notify(true));
    await waitFor(() => expect(screen.queryByTestId('pinned-row')).toBeNull());
  });
});

describe('Ranks: an empty board', () => {
  it('shows the card with the line, the start action, a link to a board with rows and three decorative ghost rows', async () => {
    const user = userEvent.setup();
    const paths = core({ registered: true, board: (_m, period) => (period === 'daily' ? { entries: [], me: null } : { entries: DAILY, me: null }) });
    await boot();
    renderApp('/ranks');
    const card = await screen.findByTestId('empty-board');
    expect(card).toHaveTextContent("No one's on today's board yet. The first win today takes the top spot.");
    expect(screen.queryByTestId('pinned-row')).toBeNull();
    expect(card.querySelectorAll('[aria-hidden="true"] > div')).toHaveLength(3);
    await user.click(within(card).getByRole('button', { name: 'Start Quick Match' }));
    expect(window.location.pathname).toBe('/matchmaking');

    act(() => navigate('/ranks'));
    const again = await screen.findByTestId('empty-board');
    await user.click(within(again).getByRole('button', { name: 'See the all-time board' }));
    expect(await screen.findAllByTestId('rank-row')).toHaveLength(4);
    expect(paths).toContain(boardPath('QUICK', 'alltime', 0, 50));
  });

  it('for Topic Duel and Battle Room the start action is aria-disabled with "Coming soon"', async () => {
    const user = userEvent.setup();
    core({ registered: false, board: () => ({ entries: [] }) });
    await boot();
    renderApp('/ranks');
    for (const mode of ['Topic Duel', 'Battle Room']) {
      await user.click(screen.getByRole('radio', { name: mode }));
      const button = await screen.findByRole('button', { name: `Start ${mode}` });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription('Coming soon');
      await user.click(button);
      expect(window.location.pathname).toBe('/ranks');
    }
  });
});

describe('Home: the rank snippet', () => {
  it('shows her Quick Match daily rank as a big number with her day\'s gain, and opens Ranks on Quick Match · Today', async () => {
    const user = userEvent.setup();
    core({ registered: true, board: () => ({ entries: DAILY, me: { rank: 3, value: 24 } }) });
    await boot();
    renderApp('/');
    const snippet = await screen.findByTestId('rank-snippet');
    expect(within(snippet).getByTestId('rank-snippet-rank')).toHaveTextContent('3');
    expect(within(snippet).getByTestId('rank-snippet-rank').className).toMatch(/26px/);
    expect(snippet).toHaveTextContent('in Kerala today');
    expect(within(snippet).getByTestId('rank-snippet-gain')).toHaveTextContent('today +24');

    await user.click(snippet);
    expect(window.location.pathname).toBe('/ranks');
    expect(screen.getByRole('radio', { name: 'Quick Match' })).toBeChecked();
    expect(screen.getByRole('tab', { name: 'Today', selected: true })).toBeInTheDocument();
  });

  it('with no position today it says so and offers a Quick Match', async () => {
    const user = userEvent.setup();
    core({ registered: true, board: () => ({ entries: [], me: null }) });
    await boot();
    renderApp('/');
    const snippet = await screen.findByTestId('rank-snippet');
    expect(snippet).toHaveTextContent("Not on today's board yet");
    await user.click(within(snippet).getByRole('button', { name: 'Play a Quick Match' }));
    expect(window.location.pathname).toBe('/matchmaking');
  });

  it('guests never see the snippet', async () => {
    core({ registered: false });
    await boot();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Playing as guest' });
    expect(screen.queryByTestId('rank-snippet')).toBeNull();
    expect(screen.queryByTestId('rank-snippet-loading')).toBeNull();
  });
});

describe('Ranks in Malayalam', () => {
  it('names the tabs and the measure in Malayalam and keeps names unchanged', async () => {
    await act(() => i18n.changeLanguage('ml'));
    core({ registered: false });
    await boot();
    renderApp('/ranks');
    await screen.findAllByTestId('rank-row');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['ഇന്ന്', 'ഈ ആഴ്ച', 'എക്കാലവും']);
    expect(screen.getByTestId('ranks-header')).toHaveTextContent('ഇന്ന് നേടിയ റേറ്റിംഗ്');
    expect(screen.getAllByTestId('rank-row')[3]).toHaveAttribute('aria-label', expect.stringContaining('അഞ്ജു'));
  });
});

