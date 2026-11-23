import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { GUEST_TOKEN_PATH, guestSession } from '../../auth/guestSession.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import i18n from '../../i18n.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { resetAnnouncements } from '../../shell/announce.ts';
import { closeRealtime } from '../../realtime/connection.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';

vi.mock('../../realtime/connection.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../realtime/connection.ts')>()),
  closeRealtime: vi.fn(),
}));

const BASE = '/api/core/v1/me/custom-topics';
const ID = '6f1b2c3d-1111-4222-8333-444455556666';
const USAGE = { topics: 2, topicCap: 50, questions: 410, questionCap: 500, warn: false };
const PROFILE = { displayName: 'Rajeev', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true };

const question = (n: number) => ({ position: n, text: `Question ${n}?`, lang: 'en' as const, options: ['a', 'b', 'c', 'd'], answerIndex: 2, explanation: `Because ${n}.` });
const detail = (count = 3, name = 'Renaissance') => ({
  customTopicId: ID, name, questionCount: count, revision: 1, updatedAt: '2026-11-11T10:00:00Z',
  questions: Array.from({ length: count }, (_, i) => question(i + 1)),
});

type Opts = {
  usage?: typeof USAGE;
  topics?: { customTopicId: string; name: string; questionCount: number; updatedAt: string }[];
  topic?: ReturnType<typeof detail>;
  deleteStatus?: number;
  listFailsOnce?: boolean;
};

function stub(opts: Opts = {}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  let listFailed = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === REFRESH_PATH) return jsonResponse({ accessToken: utf8Jwt({ name: 'Rajeev' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      if (url === PROFILE_PATH) return jsonResponse(PROFILE);
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      if (url.startsWith(BASE)) calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === `${BASE}/usage`) return jsonResponse(opts.usage ?? USAGE);
      if (url === BASE && method === 'GET') {
        if (opts.listFailsOnce && !listFailed) {
          listFailed = true;
          return jsonResponse({ status: 500, detail: 'The store is down.' }, 500, 'application/problem+json');
        }
        return jsonResponse({ usage: opts.usage ?? USAGE, topics: opts.topics ?? [] });
      }
      if (url === `${BASE}/${ID}` && method === 'GET') return jsonResponse(opts.topic ?? detail());
      if (url === `${BASE}/${ID}` && method === 'DELETE') {
        return (opts.deleteStatus ?? 204) === 204 ? new Response(null, { status: 204 }) : jsonResponse({ status: opts.deleteStatus, detail: 'Topic not found.' }, opts.deleteStatus!, 'application/problem+json');
      }
      if (url === `${BASE}/${ID}` && method === 'PUT') return jsonResponse({ customTopicId: ID, name: 'Renamed', questionCount: 3, revision: 2, usage: USAGE }, 200);
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    }),
  );
  return calls;
}

function renderApp(path: string) {
  window.history.pushState(null, '', path);
  syncFromLocation();
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App />
    </QueryClientProvider>,
  );
}

async function open(path: string) {
  session.start();
  await session.ready();
  renderApp(path);
}

beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(closeRealtime).mockClear();
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  session.reset();
  guestSession.reset();
  resetProfile();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  window.sessionStorage.clear();
  await act(() => i18n.changeLanguage('ml'));
});

describe('the list', () => {
  it('shows the meter, the private line and rows with name, count and date, and a row opens the topic', async () => {
    stub({ topics: [{ customTopicId: ID, name: 'Renaissance', questionCount: 15, updatedAt: '2026-11-11T10:00:00Z' }] });
    await open('/me/custom-topics');
    expect(await screen.findByRole('heading', { level: 1, name: 'Custom Topics' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Custom Topics · Minnal'));
    expect(await screen.findByText('Private to you · never rated')).toBeInTheDocument();
    expect(screen.getByTestId('usage-meter')).toHaveTextContent('2 / 50 topics · 410 / 500 questions');
    const row = screen.getByRole('link', { name: 'Renaissance, 15 questions, 11 Nov' });
    expect(row).toHaveTextContent('15 questions · 11 Nov');
    fireEvent.click(row);
    await waitFor(() => expect(window.location.pathname).toBe(`/me/custom-topics/${ID}`));
  });

  it('exposes each cap as a meter with its value text and warns at 80% with a way out', async () => {
    stub({ usage: { ...USAGE, questions: 410, warn: true } });
    await open('/me/custom-topics');
    expect(await screen.findByRole('meter', { name: 'Questions' })).toHaveAttribute('aria-valuetext', '410 of 500 questions');
    expect(screen.getByRole('meter', { name: 'Topics' })).toHaveAttribute('aria-valuetext', '2 of 50 topics');
    expect(screen.getByTestId('usage-meter')).toHaveAttribute('data-warn', 'true');
    expect(screen.getByText('90 questions left · delete an old topic to make room')).toBeInTheDocument();
  });

  it('with no topics shows one plain line, the meter, Import topic, and both disclosure rows expanded', async () => {
    stub({ usage: { topics: 0, topicCap: 50, questions: 0, questionCap: 500, warn: false } });
    await open('/me/custom-topics');
    expect(await screen.findByText('No topics yet. Paste your questions as JSON to make one.')).toBeInTheDocument();
    expect(screen.getByTestId('usage-meter')).toHaveTextContent('0 / 50 topics');
    expect(screen.getByRole('button', { name: 'JSON format' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Sample GPT prompt' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Import topic' }));
    await waitFor(() => expect(window.location.pathname).toBe('/me/custom-topics/import'));
  });

  it('shows an inline error with the detail and Retry, then the list once it works', async () => {
    stub({ listFailsOnce: true });
    await open('/me/custom-topics');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load this. The store is down.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('usage-meter')).toBeInTheDocument();
  });

  it('keeps Import topic aria-disabled with the offline caption when offline', async () => {
    stub();
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      await open('/me/custom-topics');
      await screen.findByTestId('usage-meter');
      expect(screen.getByRole('button', { name: 'Import topic' })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByText('You are offline. Connect to change your topics.')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    }
  });
});

describe('the topic view', () => {
  it('shows the name, count and date, the meter, Practice enabled, Battle Room disabled under 5 questions and every question with the correct option marked', async () => {
    stub();
    await open(`/me/custom-topics/${ID}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Renaissance' })).toBeInTheDocument();
    expect(screen.getByText('3 questions · updated 11 Nov')).toBeInTheDocument();
    expect(await screen.findByTestId('usage-meter')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Practice' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('button', { name: 'Use in Battle Room' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('A room needs at least 5 questions')).toBeInTheDocument();
    expect(screen.getByText('Question 1?')).toBeInTheDocument();
    expect(screen.getAllByText(/correct answer/)).toHaveLength(3);
    expect(screen.getByText('Because 2.')).toBeInTheDocument();
  });

  it('renders the first 50 questions and loads 50 more on request', async () => {
    stub({ topic: detail(120) });
    await open(`/me/custom-topics/${ID}`);
    await screen.findByText('Question 50?');
    expect(screen.queryByText('Question 51?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(await screen.findByText('Question 100?')).toBeInTheDocument();
    expect(screen.queryByText('Question 101?')).toBeNull();
  });

  it('asks before deleting with focus on Cancel, Esc cancels, and Delete removes it and returns to the list with a notice', async () => {
    const calls = stub();
    await open(`/me/custom-topics/${ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent("Delete 'Renaissance'? Its 3 questions will be removed. This can't be undone.");
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText("'Renaissance' deleted")).toBeInTheDocument();
    expect(window.location.pathname).toBe('/me/custom-topics');
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
  });

  it('a topic that is already gone just returns to the refreshed list', async () => {
    stub({ deleteStatus: 404 });
    await open(`/me/custom-topics/${ID}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(window.location.pathname).toBe('/me/custom-topics'));
    expect(screen.queryByText(/deleted/)).toBeNull();
  });

  it('keeps Re-import and Delete aria-disabled with the offline caption when offline', async () => {
    stub();
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      await open(`/me/custom-topics/${ID}`);
      await screen.findByRole('heading', { level: 1, name: 'Renaissance' });
      expect(screen.getByRole('button', { name: 'Re-import' })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('button', { name: 'Practice' })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getAllByText('You are offline. Connect to change your topics.')).toHaveLength(4);
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    }
  });
});

describe('re-import', () => {
  it('prefills the name and the current questions as JSON, counts the old questions as freed, and sends a PUT', async () => {
    const calls = stub();
    await open(`/me/custom-topics/${ID}/reimport`);
    const area = (await screen.findByRole('textbox', { name: 'Questions JSON' })) as HTMLTextAreaElement;
    await waitFor(() => expect(area.value).toContain('"Question 1?"'));
    expect(screen.getByRole('heading', { level: 1, name: 'Replace questions · Renaissance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Topic name')).toHaveValue('Renaissance');
    expect(screen.getByText('Importing replaces all 3 questions in this topic')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('import-tally')).toHaveTextContent('3 found · 410 / 500 after import'));

    fireEvent.change(screen.getByLabelText('Topic name'), { target: { value: 'Renamed' } });
    fireEvent.click(await screen.findByRole('button', { name: /^Import ·/ }));
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe(`/me/custom-topics/${ID}?imported=1`));
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toMatchObject({ name: 'Renamed' });
    expect(String((put?.body as { json: string }).json)).toContain('"Question 1?"');
  });

  it('copies the current JSON and shows Copied once', async () => {
    stub();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    await open(`/me/custom-topics/${ID}/reimport`);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy JSON' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String((writeText.mock.calls as unknown[][])[0]![0])).toContain('"Renaissance"');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
