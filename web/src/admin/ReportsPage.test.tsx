import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n.ts';
import { session } from '../auth/session.ts';
import { LiveRegions } from '../shell/LiveRegions.tsx';
import { resetAnnouncements } from '../shell/announce.ts';
import { syncFromLocation } from '../shell/router.ts';
import { jsonResponse } from '../test-utils/guest.ts';
import type { AdminReport, AdminReportGroup } from './api.ts';
import { commitPendingReports, resetReportActions } from './reportActions.ts';
import { ReportsPage } from './ReportsPage.tsx';
import { ReportBanner } from './ReportBanner.tsx';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../auth/apiFetch.ts', () => ({ apiFetch }));

function report(id: string, extra: Partial<AdminReport> = {}): AdminReport {
  return {
    reportId: id,
    note: `note ${id}`,
    reporterName: 'Anju',
    surface: 'RESULTS',
    createdAt: '2026-11-19T10:00:00Z',
    status: 'OPEN',
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    fixedByVersion: null,
    ...extra,
  };
}

function group(no: number, extra: Partial<AdminReportGroup> = {}): AdminReportGroup {
  return {
    questionId: `id-${no}`,
    displayNo: no,
    version: 2,
    textMl: `ചോദ്യം ${no}`,
    textEn: `Question ${no}`,
    currentPublishedVersion: 2,
    pendingDraftVersion: null,
    reportCount: 1,
    firstReportedAt: '2026-11-19T10:00:00Z',
    lastReportedAt: '2026-11-19T11:00:00Z',
    reports: [report(`r${no}`)],
    ...extra,
  };
}

type Post = { path: string; body: unknown };
let open: AdminReportGroup[] = [];
let closed: AdminReportGroup[] = [];
let posts: Post[] = [];
let onPost: (post: Post) => Response | undefined = () => undefined;
let gets: string[] = [];

function serve() {
  apiFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if ((init?.method ?? 'GET') === 'GET') {
      gets.push(url.pathname + url.search);
      const items = url.searchParams.get('status') === 'CLOSED' ? closed : open;
      return jsonResponse({ items, page: 0, size: 100, totalItems: items.length });
    }
    const post: Post = { path: url.pathname, body: JSON.parse(String(init?.body)) };
    posts.push(post);
    const custom = onPost(post);
    if (custom) return custom;
    const body = post.body as { questionId: string; version: number };
    open = open.filter((g) => !(g.questionId === body.questionId && g.version === body.version));
    return jsonResponse({ ok: true });
  });
}

function renderPage(path = '/admin/reports') {
  window.history.replaceState(null, '', path);
  syncFromLocation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegions />
      <ReportsPage />
    </QueryClientProvider>,
  );
}

const rowOf = (no: number) => screen.getByRole('row', { name: new RegExp(`Q ${no} v`) });

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function loaded() {
  await screen.findByRole('table');
  vi.useFakeTimers({ shouldAdvanceTime: false });
}

function startDismiss(no: number, note: string) {
  fireEvent.click(within(rowOf(no)).getByRole('button', { name: `Dismiss reports on Q ${no} v2` }));
  fireEvent.change(screen.getByLabelText(/Why are these reports/), { target: { value: note } });
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss reports' }));
}

beforeEach(() => {
  apiFetch.mockReset();
  resetAnnouncements();
  resetReportActions();
  open = [group(1), group(2), group(3)];
  closed = [];
  posts = [];
  gets = [];
  onPost = () => undefined;
  vi.spyOn(session, 'getAccessToken').mockResolvedValue('tok');
  serve();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetReportActions();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
});

describe('ReportsPage', () => {
  it('lists groups with lang text, tags, and expands to plain-text notes', async () => {
    open = [
      group(1, { currentPublishedVersion: 3, pendingDraftVersion: 4, reports: [report('a', { note: '<b>bold</b>' }), report('b', { note: null, reporterName: 'Deleted player' })], reportCount: 2 }),
    ];
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByRole('rowheader', { name: /Q 1 v2/ })).toBeTruthy();
    expect(screen.getByText('ചോദ്യം 1').getAttribute('lang')).toBe('ml');
    expect(screen.getByText('Question 1').getAttribute('lang')).toBe('en');
    expect(screen.getByText('superseded by v3')).toBeTruthy();
    expect(screen.getByText('draft v4 pending')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show reports on Q 1 v2' }));
    expect(screen.getByText('<b>bold</b>')).toBeTruthy();
    expect(screen.getByText('(no note)')).toBeTruthy();
    expect(screen.getByText(/Deleted player · results/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Q 1 v2 in the editor' }).getAttribute('href')).toContain('/admin/questions/id-1/edit?reportedVersion=2');
  });

  it('shows the empty states and keeps the tab in the URL', async () => {
    open = [];
    renderPage();
    expect(await screen.findByText(/No open reports/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'See closed reports' }));
    expect(window.location.search).toBe('?tab=closed');
    expect(await screen.findByText('No closed reports yet.')).toBeTruthy();
    expect(gets.some((g) => g.includes('status=CLOSED'))).toBe(true);
  });

  it('Closed tab shows status, closer and note, and no actions', async () => {
    closed = [
      group(5, {
        reports: [
          report('x', { status: 'RESOLVED_FIXED', fixedByVersion: 3, resolvedBy: 'Boss', resolvedAt: '2026-11-20T10:00:00Z' }),
          report('y', { status: 'DISMISSED', resolutionNote: 'Answer is right', resolvedBy: 'Boss', resolvedAt: '2026-11-20T10:00:00Z' }),
        ],
        reportCount: 2,
      }),
    ];
    renderPage('/admin/reports?tab=closed');
    await screen.findByRole('table');
    expect(screen.getByText('Fixed in v3')).toBeTruthy();
    expect(screen.getByText('Dismissed: Answer is right')).toBeTruthy();
    expect(screen.getAllByText(/Closed by Boss/).length).toBe(2);
    expect(screen.queryByRole('button', { name: /Dismiss/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Open Q/ })).toBeNull();
  });

  it('Dismiss needs a note of 1 to 500 characters', async () => {
    renderPage();
    await loaded();
    fireEvent.click(within(rowOf(1)).getByRole('button', { name: 'Dismiss reports on Q 1 v2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss reports' }));
    expect(screen.getByRole('alert').textContent).toContain('1 to 500');
    fireEvent.change(screen.getByLabelText(/Why are these reports/), { target: { value: 'x'.repeat(501) } });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss reports' }));
    expect(screen.getByRole('alert').textContent).toContain('501');
    await advance(10_000);
    expect(posts).toEqual([]);
  });

  it('Undo within 5 s sends nothing and restores the row with focus', async () => {
    renderPage();
    await loaded();
    startDismiss(1, 'fine');
    await advance(2000);
    fireEvent.click(screen.getByRole('button', { name: 'Undo: Dismissed reports on Q 1 v2' }));
    await advance(0);
    expect(document.activeElement).toBe(rowOf(1));
    expect(screen.getByTestId('live-polite').textContent).toContain('Dismiss undone');
    await advance(10_000);
    expect(posts).toEqual([]);
  });

  it('sends the dismissal after 5 s, moves focus to the next row and announces', async () => {
    renderPage();
    await loaded();
    startDismiss(1, 'Answer is right');
    await advance(0);
    expect(document.activeElement).toBe(rowOf(2));
    expect(screen.getByTestId('live-polite').textContent).toContain('Dismissed reports on Q 1 v2');
    await advance(4900);
    expect(posts).toEqual([]);
    await advance(200);
    expect(posts).toEqual([{ path: '/api/core/v1/admin/reports/dismiss', body: { questionId: 'id-1', version: 2, note: 'Answer is right' } }]);
    await advance(0);
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('sends a pending dismissal with keepalive and its note when the tab closes', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await loaded();
    startDismiss(1, 'Answer is right');
    await advance(1000);
    window.dispatchEvent(new Event('pagehide'));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/core/v1/admin/reports/dismiss');
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ questionId: 'id-1', version: 2, note: 'Answer is right' });
    await advance(10_000);
    expect(posts).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('commitPendingReports sends a dismissal still inside its window at once', async () => {
    renderPage();
    await loaded();
    startDismiss(1, 'Answer is right');
    await advance(1000);
    expect(posts).toEqual([]);
    commitPendingReports();
    await advance(0);
    expect(posts).toEqual([{ path: '/api/core/v1/admin/reports/dismiss', body: { questionId: 'id-1', version: 2, note: 'Answer is right' } }]);
  });

  it('focus goes to the previous row for the last one, then to the heading', async () => {
    open = [group(1), group(2)];
    renderPage();
    await loaded();
    startDismiss(2, 'n');
    await advance(0);
    expect(document.activeElement).toBe(rowOf(1));
    startDismiss(1, 'n');
    await advance(0);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Reports' }));
  });

  it('a failed commit brings the row back with the server detail', async () => {
    onPost = () => jsonResponse({ detail: 'These reports are already closed.' }, 409);
    renderPage();
    await loaded();
    startDismiss(1, 'n');
    await advance(5100);
    await advance(0);
    expect(within(rowOf(1)).getByText(/These reports are already closed\./)).toBeTruthy();
  });
});

describe('ReportBanner', () => {
  it('shows the count, the notes and the older-version warning', async () => {
    window.history.replaceState(null, '', '/admin/questions/id-1/edit?reportedVersion=2');
    open = [group(1, { reportCount: 3, reports: [report('a', { note: 'first' }), report('b'), report('c')] })];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReportBanner
          questionId="id-1"
          versions={[
            { version: 3, status: 'PUBLISHED', createdBy: 'x', createdAt: '', updatedAt: null, publishedBy: null, publishedAt: null, discardedBy: null, discardedAt: null },
          ]}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Reported: v2 · 3 reports')).toBeTruthy();
    expect(screen.getByText(/older than the published v3/)).toBeTruthy();
    expect(screen.getByText(/first/)).toBeTruthy();
    expect(gets[0]).toContain('questionId=id-1');
  });
});
