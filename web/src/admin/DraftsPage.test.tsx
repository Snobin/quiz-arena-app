import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n.ts';
import { session } from '../auth/session.ts';
import { LiveRegions } from '../shell/LiveRegions.tsx';
import { resetAnnouncements } from '../shell/announce.ts';
import { navigate, syncFromLocation } from '../shell/router.ts';
import { jsonResponse } from '../test-utils/guest.ts';
import AdminApp from './AdminApp.tsx';
import type { AdminDraft } from './api.ts';
import { resetDraftActions } from './draftActions.ts';
import { DraftsPage } from './DraftsPage.tsx';
import { resyncShortcuts, SHORTCUTS_KEY } from './shortcuts.ts';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../auth/apiFetch.ts', () => ({ apiFetch }));
vi.mock('./QuestionEditor.tsx', () => ({ QuestionEditor: ({ questionId }: { questionId: string | null }) => <h1 tabIndex={-1}>{`Editor ${questionId ?? 'new'}`}</h1> }));
vi.mock('./QuestionsPage.tsx', () => ({ QuestionsPage: () => <h1 tabIndex={-1}>Questions</h1> }));

function draft(no: number, extra: Partial<AdminDraft> = {}): AdminDraft {
  return {
    questionId: `id-${no}`,
    displayNo: no,
    version: 1,
    rowVersion: 0,
    content: {
      category: 'KERALA_PSC',
      subjectId: 's1',
      topicId: 't1',
      subject: 'History',
      topic: 'Kerala',
      examLevel: 'TENTH',
      difficulty: 'EASY',
      textMl: `ചോദ്യം ${no}`,
      textEn: `Question ${no}`,
      options: ['Periyar', 'Pamba', 'Bharathapuzha', 'Chaliyar'],
      answerIndex: 2,
      explanation: `Because ${no}.`,
      attribution: null,
    },
    createdBy: 'Boss',
    createdAt: '2026-11-19T10:00:00Z',
    replacesVersion: null,
    changedFields: [],
    ...extra,
  };
}

type Post = { path: string; body: unknown };
let list: AdminDraft[] = [];
let totalItems: number | null = null;
let posts: Post[] = [];
/** Answers a POST; the default succeeds and removes the draft from the list. */
let onPost: (post: Post) => Response | undefined = () => undefined;

function serve() {
  apiFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if ((init?.method ?? 'GET') === 'GET') return jsonResponse({ items: list, page: 0, size: 100, totalItems: totalItems ?? list.length });
    const post: Post = { path, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    posts.push(post);
    const custom = onPost(post);
    if (custom) return custom;
    const single = /\/questions\/([^/]+)\/versions\/(\d+)\//.exec(path);
    if (single) {
      list = list.filter((d) => !(d.questionId === single[1] && String(d.version) === single[2]));
      return jsonResponse({ ok: true });
    }
    const items = (post.body as { items: { questionId: string; version: number }[] }).items;
    list = list.filter((d) => !items.some((i) => i.questionId === d.questionId && i.version === d.version));
    return jsonResponse({ results: items.map((i) => ({ ...i, ok: true })) });
  });
}

function renderPage(app = false) {
  window.history.replaceState(null, '', app ? '/admin/drafts' : '/admin');
  syncFromLocation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegions />
      {app ? <AdminApp /> : <DraftsPage />}
    </QueryClientProvider>,
  );
}

const rowOf = (no: number) => screen.getByRole('row', { name: new RegExp(`Q ${no} v`) });
const publishCalls = () => posts.filter((p) => p.path.endsWith('/publish'));

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  apiFetch.mockReset();
  resetAnnouncements();
  resetDraftActions();
  list = [draft(1), draft(2), draft(3)];
  totalItems = null;
  posts = [];
  onPost = () => undefined;
  window.localStorage.clear();
  resyncShortcuts();
  vi.spyOn(session, 'getAccessToken').mockResolvedValue('tok');
  serve();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetDraftActions();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
});

async function loaded() {
  await screen.findByRole('table');
  vi.useFakeTimers({ shouldAdvanceTime: false });
}

describe('DraftsPage', () => {
  it('lists each draft as a row with preview, tags, change text and the three actions', async () => {
    list = [draft(1), draft(2, { version: 3, replacesVersion: 2, changedFields: ['answer', 'explanation'], content: { ...draft(2).content, textMl: null, attribution: 'LDC 2019' } })];
    renderPage();
    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').length).toBeGreaterThan(5);
    expect(screen.getByRole('rowheader', { name: 'Q 1 v1' })).toBeTruthy();
    expect(within(rowOf(1)).getByText('ചോദ്യം 1').getAttribute('lang')).toBe('ml');
    expect(within(rowOf(1)).getByText('Question 1').getAttribute('lang')).toBe('en');
    expect(within(rowOf(1)).getByText(/✓/)).toBeTruthy();
    expect(within(rowOf(1)).getByText('source not available')).toBeTruthy();
    expect(within(rowOf(1)).getByText('new')).toBeTruthy();
    expect(within(rowOf(1)).getByText('Kerala PSC')).toBeTruthy();
    const second = rowOf(2);
    expect(within(second).getByText('replaces v2 · changed: answer, explanation')).toBeTruthy();
    expect(within(second).getByText('LDC 2019')).toBeTruthy();
    // Malayalam text is missing, so the Malayalam pane falls back to English with its own lang
    expect(within(second).getByText('Players who chose Malayalam will see the English text')).toBeTruthy();
    for (const name of [/^Publish Q 2 v3$/, /^Discard Q 2 v3$/]) expect(within(second).getByRole('button', { name })).toBeTruthy();
    expect(within(second).getByRole('link', { name: 'Edit Q 2 v3' }).getAttribute('href')).toBe('/admin/questions/id-2/edit');
  });

  it('says when more drafts exist than the page shows', async () => {
    list = Array.from({ length: 100 }, (_, i) => draft(i + 1));
    totalItems = 1000;
    renderPage();
    expect(await screen.findByText('Showing the first 100 of 1,000 drafts. The rest appear as you clear these.')).toBeTruthy();
  });

  it('shows no such line when every draft is on the page', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it('shows the empty state with links', async () => {
    list = [];
    renderPage();
    expect(await screen.findByText('No drafts waiting. New questions and fixes show up here.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Upload questions' }).getAttribute('href')).toBe('/admin/upload');
    expect(screen.getByRole('link', { name: 'Add a question' }).getAttribute('href')).toBe('/admin/questions/new');
  });

  it('Publish collapses the row, announces, moves focus on, and sends only after 5 s', async () => {
    renderPage();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole('button', { name: 'Publish Q 1 v1' }));
    await advance(0);
    expect(screen.getByRole('button', { name: 'Undo: Published Q 1 v1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo: Published Q 1 v1' })).toBeTruthy();
    expect(screen.getByTestId('live-polite').textContent).toContain('Published Q 1 v1');
    expect(document.activeElement).toBe(rowOf(2));
    await advance(4900);
    expect(posts).toEqual([]);
    await advance(200);
    expect(publishCalls().map((p) => p.path)).toEqual(['/api/core/v1/admin/questions/id-1/versions/1/publish']);
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo: Published Q 1 v1' })).toBeNull());
    expect(screen.queryByRole('rowheader', { name: 'Q 1 v1' })).toBeNull();
  });

  it('Undo within 5 s sends nothing, restores the row with focus and announces', async () => {
    renderPage();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole('button', { name: 'Publish Q 1 v1' }));
    await advance(2000);
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Published Q 1 v1' }));
    await advance(0);
    expect(document.activeElement).toBe(rowOf(1));
    expect(screen.getByTestId('live-polite').textContent).toContain('Publish undone');
    await advance(10_000);
    expect(posts).toEqual([]);
  });

  it('focus goes to the previous row when the last row leaves, and to the heading when none is left', async () => {
    list = [draft(1), draft(2)];
    renderPage();
    await loaded();
    fireEvent.click(within(rowOf(2)).getByRole('button', { name: 'Discard Q 2 v1' }));
    await advance(0);
    expect(document.activeElement).toBe(rowOf(1));
    fireEvent.click(within(rowOf(1)).getByRole('button', { name: 'Discard Q 1 v1' }));
    await advance(0);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Drafts' }));
  });

  it('P, D, J, K and E work on a focused row; ? opens the help dialog', async () => {
    renderPage(true);
    await loaded();
    const first = rowOf(1);
    first.focus();
    fireEvent.keyDown(first, { key: 'j' });
    expect(document.activeElement).toBe(rowOf(2));
    fireEvent.keyDown(rowOf(2), { key: 'k' });
    expect(document.activeElement).toBe(rowOf(1));
    fireEvent.keyDown(rowOf(1), { key: 'k' });
    expect(document.activeElement).toBe(rowOf(1));
    fireEvent.keyDown(rowOf(1), { key: 'p' });
    await advance(0);
    expect(screen.getByRole('button', { name: 'Undo: Published Q 1 v1' })).toBeTruthy();
    fireEvent.keyDown(rowOf(2), { key: 'D' });
    await advance(0);
    expect(screen.getByRole('button', { name: 'Undo: Discarded Q 2 v1' })).toBeTruthy();
    fireEvent.keyDown(rowOf(3), { key: '?' });
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getAllByRole('term').map((t) => t.textContent)).toEqual(['P', 'D', 'E', 'J', 'K', '?']);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(rowOf(3), { key: 'e' });
    expect(window.location.pathname).toBe('/admin/questions/id-3/edit');
  });

  it('works on a non-Latin layout through the physical key', async () => {
    renderPage();
    await loaded();
    fireEvent.keyDown(rowOf(1), { key: 'പ', code: 'KeyP' });
    await advance(0);
    expect(screen.getByRole('button', { name: 'Undo: Published Q 1 v1' })).toBeTruthy();
    fireEvent.keyDown(within(rowOf(2)).getByRole('checkbox'), { key: 'പ', code: 'KeyP' });
    fireEvent.keyDown(rowOf(2), { key: 'പ', code: 'KeyP', ctrlKey: true });
    await advance(0);
    expect(screen.queryByRole('button', { name: 'Undo: Published Q 2 v1' })).toBeNull();
  });

  it('ignores the keys in form fields, with a modifier, and when the top-bar switch is off', async () => {
    renderPage(true);
    await loaded();
    const checkbox = within(rowOf(1)).getByRole('checkbox');
    fireEvent.keyDown(checkbox, { key: 'p' });
    fireEvent.keyDown(rowOf(1), { key: 'p', ctrlKey: true });
    fireEvent.keyDown(rowOf(1), { key: 'p', altKey: true });
    fireEvent.keyDown(rowOf(1), { key: 'p', metaKey: true });
    await advance(0);
    expect(screen.queryByRole('button', { name: 'Undo: Published Q 1 v1' })).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Single-key shortcuts' }));
    expect(screen.getByRole('switch', { name: 'Single-key shortcuts' }).getAttribute('aria-checked')).toBe('false');
    expect(window.localStorage.getItem(SHORTCUTS_KEY)).toBe('off');
    fireEvent.keyDown(rowOf(1), { key: 'p' });
    fireEvent.keyDown(rowOf(1), { key: '?' });
    await advance(0);
    expect(screen.queryByRole('button', { name: 'Undo: Published Q 1 v1' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    // the button equivalent still works
    fireEvent.click(within(rowOf(1)).getByRole('button', { name: 'Publish Q 1 v1' }));
    await advance(0);
    expect(screen.getByRole('button', { name: 'Undo: Published Q 1 v1' })).toBeTruthy();
  });

  it('bulk: one Undo line for the batch, then the bulk endpoint; a failed item returns with its reason', async () => {
    onPost = (post) => {
      if (!post.path.endsWith('/drafts/publish')) return undefined;
      list = list.filter((d) => d.questionId !== 'id-1');
      return jsonResponse({
        results: [
          { questionId: 'id-1', version: 1, ok: true, status: 'PUBLISHED' },
          { questionId: 'id-2', version: 1, ok: false, problemStatus: 409, detail: 'Only a draft can be published or discarded.' },
        ],
      });
    };
    renderPage();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole('checkbox'));
    fireEvent.click(within(rowOf(2)).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Discard selected (2)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish selected (2)' }));
    await advance(0);
    expect(screen.getByRole('button', { name: 'Undo: Published 2 drafts' })).toBeTruthy();
    expect(screen.getByTestId('live-polite').textContent).toContain('Published 2 drafts');
    expect(screen.queryByRole('rowheader', { name: 'Q 1 v1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Publish selected (0)' }).getAttribute('aria-disabled')).toBe('true');
    await advance(5100);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual({
      path: '/api/core/v1/admin/drafts/publish',
      body: { items: [{ questionId: 'id-1', version: 1 }, { questionId: 'id-2', version: 1 }] },
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole('rowheader', { name: 'Q 2 v1' })).toBeTruthy());
    expect(within(rowOf(2)).getByText(/Only a draft can be published or discarded\./)).toBeTruthy();
    expect(screen.queryByRole('rowheader', { name: 'Q 1 v1' })).toBeNull();
  });

  it('the header checkbox selects every draft on the page', async () => {
    renderPage();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all drafts on this page' }));
    expect(screen.getByRole('button', { name: 'Publish selected (3)' })).toBeTruthy();
  });

  it('a failed commit puts the row back with the Problem Details detail', async () => {
    onPost = () => jsonResponse({ status: 400, detail: '1 problem to fix before saving.', errors: [{ field: 'textEn', problem: 'too long' }] }, 400, 'application/problem+json');
    renderPage();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole('button', { name: 'Publish Q 1 v1' }));
    await advance(5100);
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole('rowheader', { name: 'Q 1 v1' })).toBeTruthy());
    expect(within(rowOf(1)).getByText(/1 problem to fix before saving\. textEn: too long/)).toBeTruthy();
  });

  it('commits at once when the admin navigates elsewhere in the console', async () => {
    renderPage(true);
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole('button', { name: 'Publish Q 1 v1' }));
    await advance(1000);
    expect(posts).toEqual([]);
    fireEvent.click(screen.getByRole('link', { name: 'Upload' }));
    await advance(0);
    expect(publishCalls()).toHaveLength(1);
  });

  it('sends pending actions with keepalive when the tab closes', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole('button', { name: 'Discard Q 1 v1' }));
    await advance(1000);
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/core/v1/admin/questions/id-1/versions/1/discard');
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    await advance(10_000);
    expect(posts).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('focuses the edited draft when the queue shows again', async () => {
    renderPage(true);
    await loaded();
    fireEvent.click(within(rowOf(2)).getByRole('link', { name: 'Edit Q 2 v1' }));
    await advance(0);
    expect(screen.getByRole('heading', { name: 'Editor id-2' })).toBeTruthy();
    vi.useRealTimers();
    act(() => navigate('/admin/drafts'));
    await waitFor(() => expect(document.activeElement).toBe(rowOf(2)));
  });
});
