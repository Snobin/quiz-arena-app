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
import { navigate, syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { guestTokenBody, jsonResponse, utf8Jwt } from '../../test-utils/guest.ts';

vi.mock('../../realtime/connection.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../realtime/connection.ts')>()),
  closeRealtime: vi.fn(),
}));

const URL_IMPORT = '/api/core/v1/me/custom-topics';
const URL_USAGE = '/api/core/v1/me/custom-topics/usage';
const URL_TOPIC = '/api/core/v1/me/custom-topics/6f1b2c3d-1111-4222-8333-444455556666';
const USAGE = { topics: 1, topicCap: 50, questions: 410, questionCap: 500, warn: false };
const PROFILE = { displayName: 'Rajeev', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true };

const q = (over: Record<string, unknown> = {}) => ({ question: 'Q?', options: ['a', 'b', 'c', 'd'], answer: 1, explanation: 'E', ...over });
const topic = (qs: unknown[], name = 'Renaissance') => JSON.stringify({ topic: name, questions: qs }, null, 2);

type Stub = { posts: { name: string; json: string }[] };

function stub({ registered = true, usage = USAGE, post }: { registered?: boolean; usage?: unknown; post?: () => Response } = {}): Stub {
  const seen: Stub = { posts: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === REFRESH_PATH) {
        return registered
          ? jsonResponse({ accessToken: utf8Jwt({ name: 'Rajeev' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() })
          : jsonResponse({ status: 401 }, 401, 'application/problem+json');
      }
      if (url === PROFILE_PATH) return jsonResponse(PROFILE);
      if (url === GUEST_TOKEN_PATH) return jsonResponse(guestTokenBody('en'));
      if (url === URL_USAGE) return jsonResponse(usage);
      if (url === URL_TOPIC) {
        return jsonResponse({ customTopicId: '6f1b2c3d-1111-4222-8333-444455556666', name: 'Renaissance', questionCount: 3, revision: 1, updatedAt: '2026-11-11T10:00:00Z',
          questions: [1, 2, 3].map((n) => ({ position: n, text: `Q${n}?`, lang: 'en', options: ['a', 'b', 'c', 'd'], answerIndex: 1, explanation: 'E' })) });
      }
      if (url === URL_IMPORT && init?.method !== 'POST') return jsonResponse({ usage: USAGE, topics: [] });
      if (url === URL_IMPORT && init?.method === 'POST') {
        seen.posts.push(JSON.parse(String(init.body)));
        return post ? post() : jsonResponse({ customTopicId: '6f1b2c3d-1111-4222-8333-444455556666', name: 'Renaissance', questionCount: 3, revision: 1, usage: USAGE }, 201);
      }
      return jsonResponse({ status: 404 }, 404, 'application/problem+json');
    }),
  );
  return seen;
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

async function openImport() {
  session.start();
  await session.ready();
  renderApp('/me/custom-topics/import');
  return screen.findByRole('textbox', { name: 'Questions JSON' }) as Promise<HTMLTextAreaElement>;
}

const paste = (area: HTMLElement, text: string) => fireEvent.change(area, { target: { value: text } });
const found = (n: number) => waitFor(() => expect(screen.getByTestId('import-tally')).toHaveTextContent(`${n} found`));
const importButton = () => screen.getByRole('button', { name: /^Import ·/ });

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

describe('entry points', () => {
  it('a registered Me tab has a Custom Topics row that opens Import', async () => {
    stub();
    session.start();
    await session.ready();
    renderApp('/me');
    const row = await screen.findByRole('link', { name: /Custom Topics/ });
    expect(row.getAttribute('href')).toMatch(/\/me\/custom-topics$/);
  });

  it('a guest sees the row locked, and it leads to Sign-in with the Import route as returnTo', async () => {
    stub({ registered: false });
    session.start();
    await session.ready();
    renderApp('/me');
    const row = await screen.findByRole('link', { name: 'Custom Topics, locked, sign in to use' });
    expect(row.getAttribute('href')).toContain('returnTo=/me/custom-topics');
  });

  it('a guest opening the route directly lands on the Sign-in prompt', async () => {
    stub({ registered: false });
    session.start();
    await session.ready();
    renderApp('/me/custom-topics/import');
    await waitFor(() => expect(window.location.pathname + window.location.search).toContain('/sign-in?returnTo=/me/custom-topics/import'));
  });
});

describe('the screen', () => {
  it('renders the name field, the paste area, a disabled Import with its reason, and the right disclosures', async () => {
    stub();
    await openImport();
    expect(screen.getByRole('heading', { level: 1, name: 'Import' })).toBeInTheDocument();
    expect(document.title).toBe('Import · Minnal');
    expect(screen.getByLabelText('Topic name')).toBeInTheDocument();
    const button = importButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Paste your questions first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON format' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Sample GPT prompt' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the tally and enables Import for a valid paste, prefilling the name from "topic" until it is edited', async () => {
    stub();
    const area = await openImport();
    paste(area, topic([q(), q(), q()]));
    await waitFor(() => expect(screen.getByLabelText('Topic name')).toHaveValue('Renaissance'));
    await found(3);
    expect(screen.getByTestId('import-tally')).toHaveTextContent('3 found · 413 / 500 after import');
    expect(importButton()).not.toHaveAttribute('aria-disabled');
    expect(importButton()).toHaveTextContent('Import · 3 questions');

    fireEvent.change(screen.getByLabelText('Topic name'), { target: { value: 'My own name' } });
    paste(area, topic([q(), q(), q()], 'Another'));
    await found(3);
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(screen.getByLabelText('Topic name')).toHaveValue('My own name');
  });

  it('accepts a fenced paste and the Malayalam shaping fixture', async () => {
    stub();
    const area = await openImport();
    paste(area, '```json\n' + topic([q({ question: 'ക്ഷ ന്റ ത്ത്ര അവൻ‍‌ ൽ ൻ ർ?', options: ['ക്ഷ', 'ന്റ', 'ത്ത്ര', 'ൽ'], explanation: 'കാരണം' })]) + '\n```');
    await found(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lists problems with line numbers, marks the bad lines, and jumps to a line on tap', async () => {
    stub();
    const area = await openImport();
    paste(area, topic([q(), q({ options: ['a', 'b', 'c'] })]));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'Fix 1 problem to import' })).toBeInTheDocument();
    expect(area).toHaveAttribute('aria-describedby', alert.id);
    const row = within(alert).getByRole('button', { name: /^Question 2, options, line \d+$/ });
    expect(row).toHaveTextContent('Question 2 needs 4 options; it has 3');
    expect(importButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Fix 1 problem to import').length).toBeGreaterThan(1);
    expect(document.querySelectorAll('[data-testid="paste-gutter"] [data-bad="true"]').length).toBeGreaterThan(0);

    fireEvent.click(row);
    expect(document.activeElement).toBe(area);
    expect(document.querySelector('[data-marked="true"]')).not.toBeNull();
  });

  it('a syntax error names the line and the likely cause, and the caret goes to its column', async () => {
    stub();
    const area = await openImport();
    paste(area, '{\n  "questions": [\n    {"question": "Q?" "options": []}\n  ]\n}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Missing comma or closing bracket before line 3');
    fireEvent.click(within(alert).getByRole('button', { name: /line 3/ }));
    expect(area.selectionStart).toBeGreaterThan(area.value.indexOf('\n  "questions"'));
  });

  it('tapping a blocked Import with problems on screen moves focus to the error list', async () => {
    stub();
    const area = await openImport();
    paste(area, topic([q({ answer: 9 })]));
    const alert = await screen.findByRole('alert');
    fireEvent.click(importButton());
    expect(document.activeElement).toBe(alert);
  });

  it('more than 20 problems shows the first 20 and a CSV of all of them', async () => {
    stub();
    const area = await openImport();
    paste(area, topic(Array.from({ length: 25 }, () => q({ answer: 9 }))));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getAllByRole('button', { name: /^Question/ })).toHaveLength(20);
    expect(within(alert).getByText('Showing the first 20 of 25, grouped by field.')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Download all problems (CSV)' })).toBeInTheDocument();
  });

  it('names the cap and the overshoot and keeps Import disabled when the paste would go over 500', async () => {
    stub({ usage: { ...USAGE, questions: 499 } });
    const area = await openImport();
    paste(area, topic([q(), q(), q()]));
    expect(await screen.findByText('Over the 500-question limit by 2. Remove 2 questions or delete an old topic.')).toBeInTheDocument();
    expect(importButton()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Over the 500-question limit')).toBeInTheDocument();
  });

  it('warns at 80% with the headroom', async () => {
    stub({ usage: { ...USAGE, questions: 398 } });
    const area = await openImport();
    paste(area, topic([q(), q()]));
    expect(await screen.findByText(/After this you'll have 100 questions left/)).toBeInTheDocument();
  });

  it('is disabled with the offline caption when offline', async () => {
    stub();
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      const area = await openImport();
      paste(area, topic([q()]));
      await found(1);
      expect(importButton()).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByText('You are offline. Connect to import.')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    }
  });
});

describe('importing', () => {
  it('sends the name and the raw pasted text, then lands on the topic view with the success card above the actions', async () => {
    const seen = stub();
    const area = await openImport();
    const text = topic([q(), q(), q()]);
    paste(area, text);
    await found(3);
    fireEvent.click(importButton());
    const heading = await screen.findByRole('heading', { level: 1, name: 'Renaissance · 3 questions imported' });
    expect(seen.posts).toEqual([{ name: 'Renaissance', json: text }]);
    expect(window.location.pathname + window.location.search).toBe('/me/custom-topics/6f1b2c3d-1111-4222-8333-444455556666?imported=1');
    expect(heading).toHaveFocus();
    expect(screen.getByText('Private to you · never rated')).toBeInTheDocument();
    expect(screen.queryByTestId('usage-meter')).toBeNull();
    expect(screen.getByRole('button', { name: 'Use in Battle Room' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Practice' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('A room needs at least 5 questions')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('minnal.customImportDraft')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Import another' }));
    expect(await screen.findByRole('textbox', { name: 'Questions JSON' })).toHaveValue('');
  });

  it("renders core's 400 field errors in the same list, keeps the pasted text and focuses the list", async () => {
    stub({
      post: () =>
        jsonResponse(
          { status: 400, detail: '1 problem to fix.', errors: [{ item: 2, field: 'options', problem: 'must have exactly 4 options (got 3)', fix: 'Give exactly 4 different options.', line: 4, column: 7 }] },
          400,
          'application/problem+json',
        ),
    });
    const area = await openImport();
    const text = topic([q(), q()]);
    paste(area, text);
    await found(2);
    fireEvent.click(importButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Question 2: must have exactly 4 options (got 3)');
    expect(alert).toHaveFocus();
    expect(area).toHaveValue(text);
    expect(importButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows a 422 cap message through the error list and a network failure as a note', async () => {
    stub({ post: () => jsonResponse({ status: 422, detail: 'You have 50 of 50 topics. Delete one to import a new topic.' }, 422, 'application/problem+json') });
    const area = await openImport();
    paste(area, topic([q()]));
    await found(1);
    fireEvent.click(importButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('You have 50 of 50 topics. Delete one to import a new topic.');
  });

  it('a failed request leaves the paste and says so', async () => {
    stub({ post: () => new Response(null, { status: 500 }) });
    const area = await openImport();
    paste(area, topic([q()]));
    await found(1);
    fireEvent.click(importButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Nothing was imported. Try again.');
    expect(area).toHaveValue(topic([q()]));
  });
});

describe('the draft and leaving', () => {
  it('restores a draft after a reload', async () => {
    window.sessionStorage.setItem('minnal.customImportDraft', JSON.stringify({ name: 'Saved', text: topic([q()]), nameEdited: true }));
    stub();
    const area = await openImport();
    expect(area).toHaveValue(topic([q()]));
    expect(screen.getByLabelText('Topic name')).toHaveValue('Saved');
  });

  it('asks before a route change that would drop a draft, and Stay keeps it', async () => {
    stub();
    const area = await openImport();
    paste(area, topic([q()]));
    act(() => navigate('/me'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Leave without importing?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(area).toHaveValue(topic([q()]));
  });

  it('does not ask when nothing was pasted', async () => {
    stub();
    await openImport();
    act(() => navigate('/me'));
    await waitFor(() => expect(window.location.pathname).toBe('/me'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('the disclosure rows', () => {
  it('puts the topic name into the GPT prompt and copies it, with "Copied" shown once', async () => {
    stub();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true });
    const area = await openImport();
    fireEvent.change(screen.getByLabelText('Topic name'), { target: { value: 'Kerala Renaissance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sample GPT prompt' }));
    expect(await screen.findByText(/on the topic "Kerala Renaissance"/)).toBeInTheDocument();
    expect(screen.getByText('Check every answer before you use it. AI makes mistakes.')).toBeInTheDocument();
    const copies = screen.getAllByRole('button', { name: 'Copy' });
    fireEvent.click(copies[1]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String((writeText.mock.calls as unknown[][])[0]![0])).toContain('"Kerala Renaissance"');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(area).toBeInTheDocument();
  });

  it('collapses both rows while the error list shows', async () => {
    stub();
    const area = await openImport();
    paste(area, topic([q({ answer: 9 })]));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'JSON format' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Sample GPT prompt' })).toHaveAttribute('aria-expanded', 'false');
  });
});
