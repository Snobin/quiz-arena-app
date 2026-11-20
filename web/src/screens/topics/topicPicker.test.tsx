import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';
import { filterCatalogue } from './TopicPicker.tsx';
import { RECENT_TOPICS_PATH, TOPICS_PATH, type Catalogue } from './topicsApi.ts';

const CATALOGUE: Catalogue = {
  category: 'KERALA_PSC',
  minQuestions: 10,
  subjects: [
    {
      subjectId: 's-hist',
      name: 'History',
      topics: [
        { topicId: 't-kh', name: 'Kerala History', publishedCount: 1240 },
        { topicId: 't-fs', name: 'Freedom Struggle', publishedCount: 12 },
      ],
    },
    { subjectId: 's-geo', name: 'ഭൂമിശാസ്ത്രം', topics: [{ topicId: 't-riv', name: 'കേരളത്തിലെ നദികൾ', publishedCount: 30 }] },
  ],
};

let online = true;
type Handlers = { topics?: () => Response | Promise<Response>; recent?: () => Response | Promise<Response> };

function stubCore(handlers: Handlers = {}) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      if (url === TOPICS_PATH) return (handlers.topics ?? (() => jsonResponse(CATALOGUE)))();
      if (url === RECENT_TOPICS_PATH) return (handlers.recent ?? (() => jsonResponse([{ topicId: 't-fs', subjectId: 's-hist', name: 'Freedom Struggle', publishedCount: 12 }])))();
      if (url.startsWith(`${RECENT_TOPICS_PATH}/`)) return new Response(null, { status: 204 });
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    }),
  );
  return calls;
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

async function boot() {
  session.start();
  await session.ready();
}

beforeEach(async () => {
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
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
  resetAnnouncements();
  document.title = '';
  await act(() => i18n.changeLanguage('ml'));
});

describe('filterCatalogue', () => {
  it('matches topic or subject, NFC and case-insensitively; a matching subject keeps all its topics', () => {
    expect(filterCatalogue(CATALOGUE.subjects, 'FREEDOM').map((s) => s.topics.map((t) => t.name))).toEqual([['Freedom Struggle']]);
    expect(filterCatalogue(CATALOGUE.subjects, 'history')[0]!.topics).toHaveLength(2);
    // Decomposed Malayalam input (base + vowel sign order is already canonical; use a precomposed Latin case too).
    expect(filterCatalogue([{ subjectId: 'x', name: 'Café', topics: [{ topicId: 'y', name: 'Q', publishedCount: 10 }] }], 'café')).toHaveLength(1);
    expect(filterCatalogue(CATALOGUE.subjects, 'നദി')).toHaveLength(1);
    expect(filterCatalogue(CATALOGUE.subjects, 'zzz')).toEqual([]);
  });
});

describe('topic picker', () => {
  it('shows the heading, Recent, and one section per subject with grouped counts and accessible names', async () => {
    stubCore();
    await boot();
    renderApp('/play/topics?for=duel');
    expect(await screen.findByRole('heading', { level: 1, name: 'Topic Duel · choose a topic' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Recent' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'History' })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: 'Kerala History, History, 1,240 questions' });
    expect(within(row).getByText('1,240 questions')).toHaveAttribute('lang', 'en');
    expect(within(row).getByText('Kerala History')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('കേരളത്തിലെ നദികൾ')).toHaveAttribute('lang', 'ml');
    expect(document.title).toBe('Choose a topic · Minnal');
    // The tab bar stays.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('uses the Solo heading for ?for=solo', async () => {
    stubCore();
    await boot();
    renderApp('/play/topics?for=solo');
    expect(await screen.findByRole('heading', { level: 1, name: 'Solo Practice · choose a topic' })).toBeInTheDocument();
  });

  it('hides Recent when there are none', async () => {
    stubCore({ recent: () => jsonResponse([]) });
    await boot();
    renderApp('/play/topics?for=duel');
    await screen.findByRole('button', { name: /Kerala History/ });
    expect(screen.queryByRole('heading', { name: 'Recent' })).toBeNull();
  });

  it('filters after a debounce, hides Recent, announces the count once, and Clear refocuses the field', async () => {
    stubCore();
    await boot();
    renderApp('/play/topics?for=duel');
    await screen.findByRole('button', { name: /Kerala History/ });
    const search = screen.getByRole('searchbox', { name: 'Search topics' });
    fireEvent.change(search, { target: { value: 'freedom' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Kerala History/ })).toBeNull());
    expect(screen.getAllByRole('button', { name: /Freedom Struggle/ })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Recent' })).toBeNull();
    await waitFor(() => expect(useAnnouncements.getState().polite.text).toBe('1 topic'));

    fireEvent.change(search, { target: { value: 'nothing here' } });
    expect(await screen.findByText("No topics match 'nothing here'")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');
    expect(await screen.findByRole('button', { name: /Kerala History/ })).toBeInTheDocument();
  });

  it('searches Malayalam text as typed', async () => {
    stubCore();
    await boot();
    renderApp('/play/topics?for=duel');
    await screen.findByRole('button', { name: /Kerala History/ });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ഭൂമി' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Kerala History/ })).toBeNull());
    expect(screen.getByRole('button', { name: /കേരളത്തിലെ നദികൾ/ })).toBeInTheDocument();
  });

  it('a tap fires the PUT without waiting and opens the stub with the topic name and a Back link', async () => {
    const calls = stubCore();
    await boot();
    renderApp('/play/topics?for=duel');
    await userEvent.click(await screen.findByRole('button', { name: /^Kerala History, History/ }));
    expect(window.location.pathname).toBe('/play/duel/t-kh');
    await waitFor(() => expect(calls).toContainEqual({ url: `${RECENT_TOPICS_PATH}/t-kh`, method: 'PUT' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Kerala History' })).toBeInTheDocument();
    expect(screen.getByText('Not available yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/play/topics?for=duel');
  });

  it('a failed PUT is ignored and Solo goes to /practice/{id}', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const calls = stubCore();
    const base = vi.mocked(fetch);
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith(`${RECENT_TOPICS_PATH}/`)) throw new TypeError('boom');
      return base(input, init);
    }));
    await boot();
    renderApp('/play/topics?for=solo');
    await userEvent.click(await screen.findByRole('button', { name: /^Kerala History, History/ }));
    expect(window.location.pathname).toBe('/practice/t-kh');
    expect(calls.length).toBeGreaterThan(0);
  });

  it('shows skeleton rows while loading', async () => {
    stubCore({ topics: () => new Promise<Response>(() => undefined) });
    await boot();
    renderApp('/play/topics?for=duel');
    expect(await screen.findByTestId('topic-skeleton')).toBeInTheDocument();
  });

  it('with no eligible topics shows one line and a Quick Match button', async () => {
    stubCore({ topics: () => jsonResponse({ ...CATALOGUE, subjects: [] }) });
    await boot();
    renderApp('/play/topics?for=duel');
    expect(await screen.findByText('No topics are ready yet. Try a Quick Match.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quick Match' })).toHaveAttribute('href', '/matchmaking');
  });

  it('a failed request shows the Problem Details detail and Retry, keeping the typed query', async () => {
    let fail = true;
    stubCore({ topics: () => (fail ? jsonResponse({ status: 503, detail: 'Catalogue is busy.' }, 503, 'application/problem+json') : jsonResponse(CATALOGUE)) });
    await boot();
    renderApp('/play/topics?for=duel');
    const search = await screen.findByRole('searchbox');
    fireEvent.change(search, { target: { value: 'kerala' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Catalogue is busy.');
    expect(search).toHaveValue('kerala');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Kerala History/ })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('kerala');
  });

  it('offline with a cached list disables the rows with the caption; with no cache it shows the error state', async () => {
    stubCore();
    await boot();
    renderApp('/play/topics?for=duel');
    const row = await screen.findByRole('button', { name: /^Kerala History, History/ });
    await act(async () => {
      online = false;
      window.dispatchEvent(new Event('offline'));
    });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(within(row).getByText('Playing needs an internet connection')).toBeInTheDocument();
    await userEvent.click(row);
    expect(window.location.pathname).toBe('/play/topics');
  });

  it('offline with no cache shows the error state', async () => {
    online = false;
    stubCore();
    await boot();
    renderApp('/play/topics?for=duel');
    expect(await screen.findByRole('alert')).toHaveTextContent("You're offline, so the topics couldn't load.");
  });

  it('a guest is sent to the Sign-in prompt with this route as returnTo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) return jsonResponse({ status: 401 }, 401, 'application/problem+json');
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    }));
    session.start();
    await session.ready();
    renderApp('/play/topics?for=solo');
    await waitFor(() => expect(window.location.pathname).toBe('/sign-in'));
    expect(window.location.search).toBe('?returnTo=/play/topics%3Ffor%3Dsolo');
  });
});
