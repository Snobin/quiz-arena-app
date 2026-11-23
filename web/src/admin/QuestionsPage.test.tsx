import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n.ts';
import { jsonResponse } from '../test-utils/guest.ts';
import { LiveRegions } from '../shell/LiveRegions.tsx';
import { resetAnnouncements } from '../shell/announce.ts';
import { syncFromLocation } from '../shell/router.ts';
import type { AdminQuestion, AdminQuestionPage, AdminSubject } from './api.ts';
import { QuestionsPage } from './QuestionsPage.tsx';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../auth/apiFetch.ts', () => ({ apiFetch }));

function question(no: number, extra: Partial<AdminQuestion> = {}): AdminQuestion {
  return {
    questionId: `id-${no}`,
    displayNo: no,
    currentVersion: 1,
    state: 'PUBLISHED',
    hasPendingDraft: false,
    pendingDraftVersion: null,
    textMl: `മലയാളം ${no}`,
    textEn: `English ${no}`,
    category: 'KERALA_PSC',
    subject: 'History',
    topic: 'Kerala',
    subjectId: 's1',
    topicId: 't1',
    examLevel: 'TENTH',
    difficulty: 'EASY',
    options: ['A1', 'B1', 'C1', 'D1'],
    answerIndex: 2,
    explanation: 'Because.',
    updatedAt: '2026-11-19T10:00:00Z',
    publishedBy: null,
    publishedAt: null,
    discardedBy: null,
    discardedAt: null,
    ...extra,
  };
}

const SUBJECTS: AdminSubject[] = [
  { id: 's1', name: 'History', topics: [{ id: 't1', name: 'Kerala' }] },
  { id: 's2', name: 'Science', topics: [{ id: 't2', name: 'Physics' }] },
];

function page(items: AdminQuestion[], totalItems = items.length, pageNo = 0): AdminQuestionPage {
  return { items, page: pageNo, size: 50, totalItems };
}

/** Answers the questions and subjects endpoints; `questions` can vary by the request URL. */
function serve(questions: (url: URL) => Response | AdminQuestionPage) {
  apiFetch.mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/subjects')) return jsonResponse(SUBJECTS);
    const result = questions(url);
    return result instanceof Response ? result : jsonResponse(result);
  });
}

function renderPage() {
  window.history.pushState(null, '', window.location.pathname === '/admin' ? window.location.pathname + window.location.search : '/admin');
  syncFromLocation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegions />
      <QuestionsPage />
    </QueryClientProvider>,
  );
}

const questionCalls = () => apiFetch.mock.calls.map((c) => new URL(String(c[0]), 'http://localhost')).filter((u) => u.pathname.endsWith('/questions'));

beforeEach(() => {
  apiFetch.mockReset();
  resetAnnouncements();
  window.history.replaceState(null, '', '/admin');
  syncFromLocation();
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
});

describe('Questions page', () => {
  it('renders an accessible table with headers, a row header, lang attributes and the pending-draft tag', async () => {
    serve(() => page([question(1234, { currentVersion: 2, hasPendingDraft: true, pendingDraftVersion: 3 }), question(7, { textMl: null })]));
    renderPage();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Question bank').tagName).toBe('CAPTION');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['No.', 'Question', 'Subject · Topic', 'Level', 'Difficulty', 'State', 'Updated', 'Actions']);
    expect(within(table).getByRole('rowheader', { name: /Q 1,234/ })).toBeTruthy();
    expect(within(table).getByText('മലയാളം 1234').getAttribute('lang')).toBe('ml');
    expect(within(table).getByText('English 1234').getAttribute('lang')).toBe('en');
    expect(within(table).getByText('Draft v3 pending')).toBeTruthy();
    expect(within(table).queryByText('മലയാളം 7')).toBeNull();
  });

  it('announces the result count once, politely', async () => {
    serve(() => page([question(1), question(2)]));
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByTestId('live-polite').textContent?.trim()).toBe('2 questions');
  });

  it('shows who published or discarded the shown version, with "seed" for a seeded publish', async () => {
    serve(() => page([question(1, { publishedBy: 'seed' }), question(2, { state: 'DISCARDED', discardedBy: 'Boss', discardedAt: '2026-11-19T10:00:00Z' })]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show details for Q 1' }));
    expect(screen.getByText(/^Published by seed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Q 2' }));
    expect(screen.getByText(/^Discarded by Boss/)).toBeTruthy();
  });

  it('expands a row from its button and from Enter on the focused row, showing both languages, options and tags', async () => {
    serve(() => page([question(1)]));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Show details for Q 1' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('മലയാളം 1').length).toBeGreaterThan(1);
    expect(screen.getByText(/correct answer/)).toBeTruthy();
    expect(screen.getAllByText('Kerala PSC').some((e) => e.tagName === 'LI')).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const row = screen.getByRole('rowheader', { name: /Q 1/ }).closest('tr')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('puts filters in the URL, resets to page 1, and clears the topic when the subject changes', async () => {
    serve(() => page([question(1)]));
    renderPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 's1' } });
    fireEvent.change(await screen.findByLabelText('Topic'), { target: { value: 't1' } });
    expect(window.location.search).toBe('?subjectId=s1&topicId=t1');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 's2' } });
    expect(window.location.search).toBe('?subjectId=s2');
    const last = questionCalls().at(-1)!;
    expect(last.searchParams.get('subjectId')).toBe('s2');
    expect(last.searchParams.get('topicId')).toBeNull();
    expect(last.searchParams.get('size')).toBe('50');
  });

  it('restores filters from the URL on load and on Back', async () => {
    window.history.replaceState(null, '', '/admin?status=DRAFT&difficulty=HARD');
    serve(() => page([question(1)]));
    renderPage();
    await screen.findByRole('table');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('DRAFT');
    expect(questionCalls()[0]!.searchParams.get('difficulty')).toBe('HARD');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'PUBLISHED' } });
    expect(window.location.search).toContain('status=PUBLISHED');
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('DRAFT');
  });

  it('debounces the search by 300 ms', async () => {
    serve(() => page([question(1)]));
    renderPage();
    await screen.findByRole('table');
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const before = questionCalls().length;
    const input = screen.getByLabelText('Search question text');
    fireEvent.change(input, { target: { value: 'ke' } });
    fireEvent.change(input, { target: { value: 'kerala' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(window.location.search).toBe('');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(window.location.search).toBe('?q=kerala');
    vi.useRealTimers();
    await screen.findByRole('table');
    expect(questionCalls().length - before).toBe(1);
  });

  it('paginates: range text, Previous aria-disabled on the first page, Next on the last', async () => {
    serve((url) => {
      const pageNo = Number(url.searchParams.get('page') ?? '0');
      return page(Array.from({ length: 50 }, (_, i) => question(pageNo * 50 + i + 1)), 120, pageNo);
    });
    renderPage();
    await screen.findByRole('table', {}, { timeout: 5000 });
    expect(screen.getByText('1–50 of 120')).toBeTruthy();
    const previous = screen.getByRole('button', { name: 'Previous' });
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('51–100 of 120', {}, { timeout: 5000 })).toBeTruthy();
    expect(window.location.search).toBe('?page=1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('101–120 of 120', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('aria-disabled')).toBe('true');
  }, 15000);

  it('shows skeleton rows while loading', () => {
    apiFetch.mockImplementation(() => new Promise(() => undefined));
    renderPage();
    expect(document.querySelectorAll('[data-skeleton-row]').length).toBeGreaterThan(0);
  });

  it('shows the Problem Details detail and a Retry that keeps the filters', async () => {
    window.history.replaceState(null, '', '/admin?status=DRAFT');
    let fail = true;
    serve(() => (fail ? jsonResponse({ status: 500, detail: 'Database is down.' }, 500, 'application/problem+json') : page([question(1)])));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Database is down.');
    expect(window.location.search).toBe('?status=DRAFT');
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('shows the bank-empty line with an Upload link', async () => {
    serve(() => page([]));
    renderPage();
    expect(await screen.findByText('No questions yet.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Upload questions' }).getAttribute('href')).toBe('/admin/upload');
  });

  it('shows the filtered-empty line, and Clear filters resets the URL and focuses the heading', async () => {
    window.history.replaceState(null, '', '/admin?status=DELETED');
    serve(() => page([]));
    renderPage();
    expect(await screen.findByText('No questions match these filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(window.location.search).toBe('');
    await act(async () => undefined);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Questions' }));
  });

  it('sets the document title', async () => {
    serve(() => page([question(1)]));
    renderPage();
    await screen.findByRole('table');
    await waitFor(() => expect(document.title).toBe('Questions · Admin · Minnal'));
  });

  it('replaces a stale page in the URL with the last valid page', async () => {
    window.history.replaceState(null, '', '/admin?page=9');
    serve((url) => {
      const pageNo = Number(url.searchParams.get('page') ?? '0');
      return pageNo >= 3 ? page([], 120, pageNo) : page([question(pageNo + 1)], 120, pageNo);
    });
    renderPage();
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(window.location.search).toBe('?page=2');
    expect(screen.getByText('101–120 of 120')).toBeTruthy();
  });

  it('drops the page when a filter changes', async () => {
    window.history.replaceState(null, '', '/admin?page=1');
    serve(() => page([question(1)], 120, 1));
    renderPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'HARD' } });
    expect(window.location.search).toBe('?difficulty=HARD');
    await screen.findByRole('table');
    const last = questionCalls().at(-1)!;
    expect(last.searchParams.get('difficulty')).toBe('HARD');
    expect(last.searchParams.get('page')).toBeNull();
  });

  describe('delete', () => {
    it('opens an alertdialog naming the question with focus on Cancel, and Esc cancels without deleting', async () => {
      serve(() => page([question(1234)]));
      renderPage();
      const del = await screen.findByRole('button', { name: 'Delete Q 1,234' });
      del.focus();
      fireEvent.click(del);
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toContain('Delete Q 1,234?');
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
      fireEvent.keyDown(dialog, { key: 'Escape' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(document.activeElement).toBe(del);
      expect(apiFetch.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
    });

    it('confirming sends DELETE, announces it and reloads the list', async () => {
      serve(() => page([question(1234)]));
      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Delete Q 1,234' }));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Q 1,234' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      const sent = apiFetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'DELETE');
      expect(String(sent?.[0])).toContain('/api/core/v1/admin/questions/id-1234');
      expect(await screen.findByText('Deleted Q 1,234')).toBeTruthy();
    });

    it('offers New question and an Edit link per row, and no Delete for a deleted row', async () => {
      serve(() => page([question(1, { state: 'DELETED' })]));
      renderPage();
      expect((await screen.findByRole('link', { name: 'New question' })).getAttribute('href')).toBe('/admin/questions/new');
      expect((await screen.findByRole('link', { name: 'Edit Q 1' })).getAttribute('href')).toBe('/admin/questions/id-1/edit');
      expect(screen.queryByRole('button', { name: 'Delete Q 1' })).toBeNull();
    });
  });
});
