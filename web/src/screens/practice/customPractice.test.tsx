import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { useFakeRealtime } from '../../test-utils/realtime.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';
import { RECENT_TOPICS_PATH, TOPICS_PATH } from '../topics/topicsApi.ts';
import { SOLO_SESSIONS_PATH, type AnswerResult, type NextQuestion } from './practiceApi.ts';

const CUSTOM = '6f1b2c3d-1111-4222-8333-444455556666';
const SESSION = '9d3e0000-0000-4000-8000-000000000002';
const LIST_PATH = '/api/core/v1/me/custom-topics';
const SOURCE = { type: 'CUSTOM', customTopicId: CUSTOM, topicName: 'Renaissance' } as const;

const problem = (status: number, type: string, detail: string) => jsonResponse({ type: `urn:minnal:problem:${type}`, status, detail }, status, 'application/problem+json');

function question(position: number, text = `Own question ${position}?`): NextQuestion {
  return {
    position,
    source: SOURCE,
    reshuffled: false,
    question: { questionId: `c-${position}`, version: 1, textMl: text, options: ['ഒന്ന്', 'രണ്ട്', 'മൂന്ന്', 'നാല്'] },
  };
}

const answerOf = (correct: boolean, answered: number, right: number): AnswerResult => ({
  correct,
  answerIndex: 2,
  explanation: 'കാരണം ഇതാണ്.',
  answeredCount: answered,
  correctCount: right,
});

let online = true;
type Handlers = { next?: (n: number) => Response; answer?: (n: number) => Response; start?: () => Response };

function stubCore(handlers: Handlers = {}) {
  const calls: { url: string; method: string; body?: string }[] = [];
  let nexts = 0;
  let answers = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, ...(init?.body ? { body: String(init.body) } : {}) });
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true });
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      if (url === TOPICS_PATH) return jsonResponse({ category: 'KERALA_PSC', minQuestions: 10, subjects: [{ subjectId: 's1', name: 'History', topics: [{ topicId: 't1', name: 'Kerala History', publishedCount: 40 }] }] });
      if (url === RECENT_TOPICS_PATH) return jsonResponse([]);
      if (url === LIST_PATH) {
        return jsonResponse({
          usage: { topics: 2, questions: 8, topicCap: 50, questionCap: 500, warn: false },
          topics: [
            { customTopicId: CUSTOM, name: 'Renaissance', questionCount: 15, updatedAt: '2026-11-11T10:00:00Z' },
            { customTopicId: '6f1b2c3d-1111-4222-8333-444455557777', name: 'ഭരണഘടന', questionCount: 1, updatedAt: '2026-11-10T10:00:00Z' },
          ],
        });
      }
      if (url === SOLO_SESSIONS_PATH && method === 'POST') return (handlers.start ?? (() => jsonResponse({ sessionId: SESSION, source: SOURCE, poolSize: 15 }, 201)))();
      if (url.endsWith('/next')) {
        nexts += 1;
        return (handlers.next ?? ((n) => jsonResponse(question(n))))(nexts);
      }
      if (url.endsWith('/answers')) {
        answers += 1;
        return (handlers.answer ?? ((n) => jsonResponse(answerOf(true, n, n))))(answers);
      }
      if (url.endsWith('/end')) return jsonResponse({ answeredCount: 1, correctCount: 1 });
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
  useFakeRealtime();
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
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  window.sessionStorage.clear();
  document.title = '';
  await act(() => i18n.changeLanguage('ml'));
});

const open = async () => {
  await boot();
  renderApp(`/practice/custom/${CUSTOM}`);
  return screen.findByRole('heading', { level: 1, name: /Own question 1\?/ }, { timeout: 8000 });
};

describe('solo practice on a custom topic', () => {
  it('starts a CUSTOM session and shows the name, the own tag, the written language and no EN tag', async () => {
    const calls = stubCore();
    const heading = await open();
    expect(calls.find((c) => c.method === 'POST' && c.url === SOLO_SESSIONS_PATH)?.body).toBe(JSON.stringify({ source: { type: 'CUSTOM', customTopicId: CUSTOM } }));
    expect(heading).toHaveAttribute('lang', 'ml');
    expect(screen.queryByTestId('en-tag')).toBeNull();
    expect(screen.getByTestId('practice-topic')).toHaveTextContent('Renaissance');
    expect(screen.getByTestId('practice-own-tag')).toHaveTextContent('Own');
    await waitFor(() => expect(document.title).toBe('Practice · Renaissance · Minnal'));
    expect(window.sessionStorage.getItem(`minnal.practice.${CUSTOM}`)).toContain(SESSION);
  });

  it('shows the explanation with no source line and no report link', async () => {
    stubCore();
    await open();
    await userEvent.click(screen.getByTestId('option-2'));
    await screen.findByTestId('practice-result');
    expect(screen.getByTestId('reveal-details')).toHaveTextContent('കാരണം ഇതാണ്.');
    expect(screen.queryByTestId('attribution')).toBeNull();
    expect(screen.queryByText(/source not available/i)).toBeNull();
    expect(screen.queryByTestId('report-link')).toBeNull();
    expect(screen.queryByText(/Practise this topic/i)).toBeNull();
  });

  it('a re-import shows the updated notice once, announces it and keeps the tally', async () => {
    stubCore({
      answer: (n) => (n === 1 ? problem(409, 'topic-changed', 'This topic was updated.') : jsonResponse(answerOf(true, 2, 1))),
      next: (n) => jsonResponse({ ...question(n === 1 ? 1 : 2, n === 1 ? undefined : 'New question?'), reshuffled: n > 1 }),
    });
    await open();
    await userEvent.click(screen.getByTestId('option-2'));
    await screen.findByRole('heading', { level: 1, name: /New question\?/ });
    expect(screen.getByTestId('practice-changed')).toHaveTextContent('This topic was updated. Starting again with its new questions.');
    expect(screen.queryByTestId('practice-reshuffled')).toBeNull();
    expect(useAnnouncements.getState().polite.text.trim()).toBe('This topic was updated. Starting again with its new questions.');
    expect(screen.getByTestId('practice-tally')).toHaveTextContent('1 answered');
  });

  it('a deleted topic shows "This topic was deleted" with the last tally and Choose another topic', async () => {
    stubCore({
      next: (n) => (n === 1 ? jsonResponse(question(1)) : problem(404, 'topic-deleted', 'This topic was deleted.')),
      answer: () => jsonResponse(answerOf(true, 1, 1)),
    });
    await open();
    await userEvent.click(screen.getByTestId('option-2'));
    await screen.findByTestId('practice-result');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'This topic was deleted' })).toBeInTheDocument();
    expect(screen.getByTestId('practice-tally')).toHaveTextContent('1 answered · 1 correct');
    expect(screen.getByRole('button', { name: 'Choose another topic' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /again/i })).toBeNull();
    expect(window.sessionStorage.getItem(`minnal.practice.${CUSTOM}`)).toBeNull();
  });

  it('a start that finds no such topic shows the deleted state', async () => {
    stubCore({ start: () => problem(404, 'not-found', 'Topic not found.') });
    await boot();
    renderApp(`/practice/custom/${CUSTOM}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'This topic was deleted' }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('a malformed id goes back to the picker without a request', async () => {
    const calls = stubCore();
    await boot();
    renderApp('/practice/custom/not-an-id');
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/play/topics?for=solo'));
    expect(calls.some((c) => c.url === SOLO_SESSIONS_PATH)).toBe(false);
  });

  it('a guest is sent to the Sign-in prompt with this route as returnTo and no session request is sent', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === REFRESH_PATH) return jsonResponse({ status: 401 }, 401, 'application/problem+json');
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    });
    vi.stubGlobal('fetch', fetchMock);
    session.start();
    await session.ready();
    renderApp(`/practice/custom/${CUSTOM}`);
    await waitFor(() => expect(window.location.pathname).toBe('/sign-in'));
    expect(window.location.search).toBe(`?returnTo=/practice/custom/${CUSTOM}`);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/solo/'))).toBe(false);
  });
});

describe('My topics in the solo picker', () => {
  it('shows the section above the subjects, filters it with search and opens the custom route without a recent write', async () => {
    const calls = stubCore();
    await boot();
    renderApp('/play/topics?for=solo');
    const mine = await screen.findByTestId('my-topics', undefined, { timeout: 8000 });
    expect(screen.getByRole('heading', { level: 2, name: 'My topics' })).toBeInTheDocument();
    expect(within(mine).getByText('15 questions · private')).toBeInTheDocument();
    expect(within(mine).getByText('1 question · private')).toBeInTheDocument();
    const subject = screen.getByRole('heading', { level: 2, name: 'History' });
    expect(screen.getByRole('heading', { level: 2, name: 'My topics' }).compareDocumentPosition(subject) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.type(screen.getByLabelText(/search/i), 'renais');
    await waitFor(() => expect(within(screen.getByTestId('my-topics')).queryByText('ഭരണഘടന')).toBeNull());
    expect(screen.queryByRole('heading', { level: 2, name: 'History' })).toBeNull();

    await userEvent.click(within(screen.getByTestId('my-topics')).getByRole('button', { name: /Renaissance/ }));
    await waitFor(() => expect(window.location.pathname).toBe(`/practice/custom/${CUSTOM}`));
    expect(calls.some((c) => c.method === 'PUT' && c.url.startsWith(RECENT_TOPICS_PATH))).toBe(false);
  });

  it('Topic Duel never lists or fetches custom topics', async () => {
    const calls = stubCore();
    await boot();
    renderApp('/play/topics?for=duel');
    await screen.findByRole('heading', { level: 2, name: 'History' }, { timeout: 8000 });
    expect(screen.queryByTestId('my-topics')).toBeNull();
    expect(calls.some((c) => c.url === LIST_PATH)).toBe(false);
  });
});
