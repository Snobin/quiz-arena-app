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

const TOPIC = '7c1f0c9a-1111-4a2b-8c3d-0e1f2a3b4c5d';
const SESSION = '9d3e0000-0000-4000-8000-000000000001';
const SOURCE = { type: 'BANK', topicId: TOPIC, topicName: 'Kerala History', subjectName: 'History' } as const;

function question(position: number, reshuffled = false): NextQuestion {
  return {
    position,
    source: SOURCE,
    reshuffled,
    question: { questionId: `q-${position}`, version: 1, textEn: `Question number ${position}?`, options: ['Alpha', 'Beta', 'Gamma', 'Delta'] },
  };
}

const answerOf = (correct: boolean, answered: number, right: number): AnswerResult => ({
  correct,
  answerIndex: 2,
  explanation: 'Because Gamma.',
  answeredCount: answered,
  correctCount: right,
});

let online = true;
type Calls = { url: string; method: string; body?: string }[];
type Handlers = {
  start?: () => Response;
  next?: (n: number) => Response;
  answer?: (n: number) => Response;
  end?: () => Response;
};

function stubCore(handlers: Handlers = {}) {
  const calls: Calls = [];
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
      if (url === TOPICS_PATH) return jsonResponse({ category: 'KERALA_PSC', minQuestions: 10, subjects: [] });
      if (url === RECENT_TOPICS_PATH) return jsonResponse([]);
      if (url === SOLO_SESSIONS_PATH && method === 'POST') return (handlers.start ?? (() => jsonResponse({ sessionId: SESSION, source: SOURCE, poolSize: 12 }, 201)))();
      if (url.endsWith('/next')) {
        nexts += 1;
        return (handlers.next ?? ((n) => jsonResponse(question(n))))(nexts);
      }
      if (url.endsWith('/answers')) {
        answers += 1;
        return (handlers.answer ?? ((n) => jsonResponse(answerOf(true, n, n))))(answers);
      }
      if (url.endsWith('/end')) return (handlers.end ?? (() => jsonResponse({ answeredCount: 2, correctCount: 1 })))();
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

const openPractice = async () => {
  await boot();
  renderApp(`/practice/${TOPIC}`);
  return screen.findByRole('heading', { level: 1, name: /Question number 1\?/ }, { timeout: 8000 });
};

describe('solo practice', () => {
  it('starts a session, shows the question with the tally, title and no timer, score or volt', async () => {
    const calls = stubCore();
    const heading = await openPractice();
    expect(heading).toHaveAccessibleName('Question number 1?, Question 1 · Practice');
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.title).toBe('Practice · Kerala History · Minnal');
    expect(screen.getByTestId('practice-tally')).toHaveTextContent('0 answered · 0 correct');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url === SOLO_SESSIONS_PATH)?.body).toBe(JSON.stringify({ source: { type: 'BANK', topicId: TOPIC } }));
    expect(document.querySelector('[data-accent]')).toBeNull();
    expect(screen.queryByTestId('timer')).toBeNull();
    expect(window.sessionStorage.getItem(`minnal.practice.${TOPIC}`)).toContain(SESSION);
  });

  it('shows the result in place with an ink tile, the explanation, the report link, the announcement and focus on Next', async () => {
    stubCore({ answer: () => jsonResponse(answerOf(false, 1, 0)) });
    await openPractice();
    await userEvent.click(screen.getByTestId('option-0'));
    await waitFor(() => expect(screen.getByTestId('practice-result')).toBeInTheDocument());
    expect(screen.getByTestId('practice-result')).toHaveTextContent('Answer: Gamma');
    expect(screen.getByTestId('option-2')).toHaveAttribute('data-state', 'correct');
    expect(within(screen.getByTestId('option-2')).getByTestId('practice-correct-tile')).toBeInTheDocument();
    expect(screen.getByTestId('option-0')).toHaveAttribute('data-state', 'wrong-pick');
    expect(screen.getByTestId('option-0')).toHaveTextContent('⚠');
    expect(screen.getByTestId('option-1')).toHaveAttribute('data-state', 'muted');
    expect(screen.getByTestId('reveal-details')).toHaveTextContent('Because Gamma.');
    expect(screen.getByTestId('attribution')).toHaveTextContent('source not available');
    expect(screen.getByTestId('report-link')).toBeInTheDocument();
    expect(screen.getByTestId('practice-tally')).toHaveTextContent('1 answered · 0 correct');
    expect(useAnnouncements.getState().polite.text.trim()).toBe('Wrong. Answer: Gamma');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' })));
    expect(document.querySelector('[data-accent]')).toBeNull();
  });

  it('a correct answer reads "Correct!" and Next loads the next question with focus on its heading', async () => {
    stubCore({ answer: () => jsonResponse(answerOf(true, 1, 1)) });
    await openPractice();
    await userEvent.click(screen.getByTestId('option-2'));
    expect(await screen.findByText('Correct!')).toBeInTheDocument();
    expect(useAnnouncements.getState().polite.text.trim()).toBe('Correct. Answer: Gamma');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const heading = await screen.findByRole('heading', { level: 1, name: /Question number 2\?/ });
    expect(heading).toHaveAccessibleName('Question number 2?, Question 2 · Practice');
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.queryByTestId('practice-result')).toBeNull();
  });

  it('a reshuffled question shows the notice once and announces it', async () => {
    stubCore({ next: (n) => jsonResponse(question(n, true)) });
    await openPractice();
    expect(screen.getByTestId('practice-reshuffled')).toHaveTextContent("You've seen every question in this topic. Starting again in a new order.");
    await waitFor(() => expect(useAnnouncements.getState().polite.text.trim()).toBe("You've seen every question in this topic. Starting again in a new order."));
  });

  it('Stop with answers ends the session and shows the summary; Practise again starts a new one', async () => {
    const calls = stubCore({ next: () => jsonResponse(question(1)) });
    await openPractice();
    await userEvent.click(screen.getByTestId('option-2'));
    await screen.findByTestId('practice-result');
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Practice finished' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByTestId('practice-tally')).toHaveTextContent('2 answered · 1 correct');
    expect(calls.some((c) => c.url.endsWith('/end') && c.method === 'POST')).toBe(true);
    expect(window.sessionStorage.getItem(`minnal.practice.${TOPIC}`)).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose another topic' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Practise again' }));
    await screen.findByRole('heading', { level: 1, name: /Question number 1\?/ });
    expect(calls.filter((c) => c.url === SOLO_SESSIONS_PATH && c.method === 'POST')).toHaveLength(2);
  });

  it('Stop with answers while the network is down clears the stored session and leaves for the picker', async () => {
    stubCore();
    await openPractice();
    await userEvent.click(screen.getByTestId('option-2'));
    await screen.findByTestId('practice-result');
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/end')) throw new TypeError('offline');
      return base(input, init);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(window.location.pathname).toBe('/play/topics'));
    expect(window.sessionStorage.getItem(`minnal.practice.${TOPIC}`)).toBeNull();
  });

  it('Stop with no answers goes straight to the picker, with no summary', async () => {
    stubCore();
    await openPractice();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(window.location.pathname).toBe('/play/topics'));
    expect(window.location.search).toBe('?for=solo');
    expect(screen.queryByText('Practice finished')).toBeNull();
  });

  it('an expired session shows the timed-out card with the last tally and Start again', async () => {
    const calls = stubCore({ next: (n) => (n === 2 ? jsonResponse({ status: 404 }, 404, 'application/problem+json') : jsonResponse(question(1))) });
    await openPractice();
    await userEvent.click(screen.getByTestId('option-2'));
    await screen.findByTestId('practice-result');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'This practice session timed out' })).toBeInTheDocument();
    expect(screen.getByTestId('practice-tally')).toHaveTextContent('1 answered · 1 correct');
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }));
    await screen.findByRole('heading', { level: 1, name: /Question number 1\?/ });
    expect(calls.filter((c) => c.method === 'POST' && c.url === SOLO_SESSIONS_PATH)).toHaveLength(2);
  });

  it('a network failure keeps the screen with an inline error and Retry', async () => {
    stubCore({ answer: (n) => (n === 1 ? jsonResponse({ status: 503, detail: 'later' }, 503, 'application/problem+json') : jsonResponse(answerOf(true, 1, 1))) });
    await openPractice();
    await userEvent.click(screen.getByTestId('option-2'));
    expect(await screen.findByTestId('practice-error')).toHaveTextContent("Couldn't send your answer.");
    expect(screen.getByTestId('option-2')).toHaveAttribute('data-state', 'idle');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('practice-result')).toBeInTheDocument();
  });

  it('offline: options and Next are aria-disabled with the offline caption', async () => {
    stubCore();
    await openPractice();
    online = false;
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('option-0')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Playing needs an internet connection')).toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls.length;
    await userEvent.click(screen.getByTestId('option-0'));
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });

  it('a 422 topic-unavailable on start opens the picker with its notice', async () => {
    stubCore({ start: () => jsonResponse({ status: 422, type: 'urn:minnal:problem:topic-unavailable' }, 422, 'application/problem+json') });
    await boot();
    renderApp(`/practice/${TOPIC}`);
    await waitFor(() => expect(window.location.pathname).toBe('/play/topics'));
    expect(window.location.search).toBe('?for=solo&notice=small');
    expect((await screen.findAllByText('That topic has too few questions right now. Pick another.')).length).toBeGreaterThan(0);
  });

  it('a reload resumes the stored session without starting a new one', async () => {
    window.sessionStorage.setItem(`minnal.practice.${TOPIC}`, JSON.stringify({ sessionId: SESSION, answered: 3, correct: 2 }));
    const calls = stubCore({ next: () => jsonResponse(question(4)) });
    await boot();
    renderApp(`/practice/${TOPIC}`);
    await screen.findByRole('heading', { level: 1, name: /Question number 4\?/ }, { timeout: 8000 });
    expect(calls.some((c) => c.url === SOLO_SESSIONS_PATH && c.method === 'POST')).toBe(false);
    expect(screen.getByTestId('practice-tally')).toHaveTextContent('3 answered · 2 correct');
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
    renderApp(`/practice/${TOPIC}`);
    await waitFor(() => expect(window.location.pathname).toBe('/sign-in'));
    expect(window.location.search).toBe(`?returnTo=/practice/${TOPIC}`);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/solo/'))).toBe(false);
  });
});
