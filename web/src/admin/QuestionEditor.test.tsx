import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n.ts';
import { jsonResponse } from '../test-utils/guest.ts';
import { LiveRegions } from '../shell/LiveRegions.tsx';
import { resetAnnouncements } from '../shell/announce.ts';
import { navigate, syncFromLocation } from '../shell/router.ts';
import type { AdminSubject, QuestionDetail } from './api.ts';
import { QuestionEditor } from './QuestionEditor.tsx';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../auth/apiFetch.ts', () => ({ apiFetch }));

const SUBJECTS: AdminSubject[] = [
  { id: 's1', name: 'History', topics: [{ id: 't1', name: 'Kerala' }] },
  { id: 's2', name: 'Science', topics: [{ id: 't2', name: 'Physics' }] },
];

function detail(extra: Partial<QuestionDetail> = {}, status: QuestionDetail['editing']['status'] = 'PUBLISHED'): QuestionDetail {
  return {
    questionId: 'q1',
    displayNo: 1234,
    sourceRef: 'REF-1',
    deleted: false,
    deletedAt: null,
    editing: {
      version: 2,
      status,
      rowVersion: 3,
      content: {
        category: 'KERALA_PSC',
        subjectId: 's1',
        topicId: 't1',
        subject: 'History',
        topic: 'Kerala',
        examLevel: 'TENTH',
        difficulty: 'EASY',
        textMl: null,
        textEn: 'Which river?',
        options: ['Periyar', 'Pamba', 'Bharathapuzha', 'Chaliyar'],
        answerIndex: 0,
        explanation: 'Because.',
        attribution: null,
      },
    },
    versions: [
      { version: 2, status, createdBy: 'Boss', createdAt: '2026-11-19T10:00:00Z', updatedAt: null },
      { version: 1, status: 'PUBLISHED', createdBy: 'seed', createdAt: '2026-11-01T10:00:00Z', updatedAt: null },
    ],
    ...extra,
  };
}

type Call = { method: string; path: string; body: unknown };
let calls: Call[] = [];

function serve(handler: (call: Call) => Response | undefined, question: QuestionDetail = detail()) {
  apiFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    const call: Call = { method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const custom = handler(call);
    if (custom) return custom;
    if (path.endsWith('/subjects')) return jsonResponse(SUBJECTS);
    if (call.method === 'GET') return jsonResponse(question);
    return jsonResponse({ questionId: 'q1', displayNo: 1234, version: 2, status: 'DRAFT', rowVersion: 4 });
  });
}

function renderEditor(questionId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegions />
      <QuestionEditor questionId={questionId} />
    </QueryClientProvider>,
  );
}

async function ready() {
  await screen.findByRole('form', { name: 'Question fields' });
  await screen.findByRole('option', { name: 'History' });
}

const field = (name: string) => within(screen.getByRole('form', { name: 'Question fields' })).getByLabelText(name) as HTMLInputElement;

beforeEach(() => {
  calls = [];
  apiFetch.mockReset();
  resetAnnouncements();
  window.history.replaceState(null, '', '/admin/questions/q1/edit');
  syncFromLocation();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  syncFromLocation();
});

describe('QuestionEditor', () => {
  it('shows the header for a published question and the version history with "seed"', async () => {
    serve(() => undefined);
    renderEditor('q1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Q 1,234 · new draft from published v2' })).toBeTruthy();
    const history = screen.getByRole('table');
    expect(within(history).getByText('seed')).toBeTruthy();
    expect(within(history).getByText('Boss')).toBeTruthy();
  });

  it('shows "editing v2 (draft)" for an open draft', async () => {
    serve(() => undefined, detail({}, 'DRAFT'));
    renderEditor('q1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Q 1,234 · editing v2 (draft)' })).toBeTruthy();
  });

  it('gives an empty save an error summary that takes focus, with links to the fields and aria-invalid', async () => {
    serve(() => undefined);
    renderEditor(null);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    const summary = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(within(summary).getByRole('heading').textContent).toContain('11 problems to fix before saving');
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(field('Explanation').getAttribute('aria-invalid')).toBe('true');
    expect(field('Explanation').getAttribute('aria-describedby')).toBe('q-explanation-error');
    expect(document.getElementById('q-explanation-error')?.textContent).toContain('required');
    fireEvent.click(within(summary).getByRole('link', { name: /^Explanation: required/ }));
    expect(document.activeElement).toBe(field('Explanation'));
  });

  it('shows server field errors the same way', async () => {
    serve((call) =>
      call.method === 'PUT'
        ? jsonResponse({ status: 400, detail: '1 problem', errors: [{ field: 'attribution', problem: 'must be at most 120 characters (got 130)', fix: 'Shorten it by 10 characters.' }] }, 400, 'application/problem+json')
        : undefined,
    );
    renderEditor('q1');
    await ready();
    fireEvent.change(field('Explanation'), { target: { value: 'Changed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    const summary = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(summary.textContent).toContain('1 problem to fix before saving');
    expect(field('Source attribution').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('q-attribution-error')?.textContent).toContain('Shorten it by 10 characters.');
  });

  it('saves a draft with the row version, then shows the saved line and refreshes the history', async () => {
    serve(() => undefined, detail({}, 'DRAFT'));
    renderEditor('q1');
    await ready();
    fireEvent.change(field('Explanation'), { target: { value: 'Changed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect((await screen.findAllByText('Saved as draft v2 · not live until published')).length).toBeGreaterThan(0);
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.path).toBe('/api/core/v1/admin/questions/q1/draft');
    expect(put?.body).toMatchObject({ rowVersion: 3, explanation: 'Changed.', answerIndex: 0 });
  });

  it('omits the row version when editing a published question (a new draft is created)', async () => {
    serve(() => undefined);
    renderEditor('q1');
    await ready();
    fireEvent.change(field('Explanation'), { target: { value: 'Changed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    await screen.findAllByText(/Saved as draft/);
    expect(calls.find((c) => c.method === 'PUT')?.body).not.toHaveProperty('rowVersion');
  });

  it('a 409 says the draft changed, keeps what was typed, and Reload brings the server draft', async () => {
    let first = true;
    serve(
      (call) => {
        if (call.method === 'PUT') return jsonResponse({ status: 409, detail: 'This draft changed since you opened it.' }, 409, 'application/problem+json');
        if (call.method === 'GET' && call.path.endsWith('/q1') && !first) return jsonResponse(detail({}, 'DRAFT'));
        if (call.path.endsWith('/q1')) first = false;
        return undefined;
      },
      detail({}, 'DRAFT'),
    );
    renderEditor('q1');
    await ready();
    fireEvent.change(field('Explanation'), { target: { value: 'My edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect((await screen.findAllByText('This draft changed since you opened it.')).length).toBeGreaterThan(0);
    expect(field('Explanation').value).toBe('My edit');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(field('Explanation').value).toBe('Because.'));
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  it('previews both languages, falling back with a note, and shows the source line when attribution is blank', async () => {
    serve(() => undefined);
    renderEditor('q1');
    await ready();
    const ml = screen.getByRole('region', { name: 'Malayalam' });
    const en = screen.getByRole('region', { name: 'English' });
    expect(within(ml).getByText('Players who chose Malayalam will see the English text')).toBeTruthy();
    expect(within(ml).getByTestId('preview-text-ml').textContent).toBe('Which river?');
    expect(within(en).queryByText(/Players who chose English/)).toBeNull();
    expect(within(ml).getByText('ഉറവിടം ലഭ്യമല്ല')).toBeTruthy();
    expect(within(en).getByText('source not available')).toBeTruthy();
    expect(within(en).getByTestId('option-0').getAttribute('data-state')).toBe('correct');

    fireEvent.change(field('Malayalam text'), { target: { value: 'ഏത് നദി?' } });
    expect(within(ml).queryByText(/Players who chose/)).toBeNull();
    expect(within(en).queryByText(/Players who chose/)).toBeNull();
  });

  it('shows the Malayalam fallback note on the English pane when only Malayalam is filled', async () => {
    serve(() => undefined, detail({ editing: { ...detail().editing, content: { ...detail().editing.content, textEn: null, textMl: 'ഏത് നദി?' } } }));
    renderEditor('q1');
    await ready();
    expect(within(screen.getByRole('region', { name: 'English' })).getByText('Players who chose English will see the Malayalam text')).toBeTruthy();
  });

  it('guards leaving with unsaved changes: in-app confirm, Stay keeps the page, Leave goes', async () => {
    serve(() => undefined);
    renderEditor('q1');
    await ready();
    fireEvent.change(field('Explanation'), { target: { value: 'Changed.' } });
    act(() => navigate('/admin'));
    const dialog = await screen.findByRole('alertdialog');
    expect(window.location.pathname).toBe('/admin/questions/q1/edit');
    const stay = within(dialog).getByRole('button', { name: 'Stay' });
    expect(document.activeElement).toBe(stay);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(window.location.pathname).toBe('/admin/questions/q1/edit');
    act(() => navigate('/admin'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave' }));
    expect(window.location.pathname).toBe('/admin');
  });

  it('registers beforeunload only while there are unsaved changes', async () => {
    serve(() => undefined);
    renderEditor('q1');
    await ready();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    fireEvent.change(field('Explanation'), { target: { value: 'Changed.' } });
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('is read-only for a deleted question, with Restore', async () => {
    serve(() => undefined, detail({ deleted: true, deletedAt: '2026-11-20T00:00:00Z' }));
    renderEditor('q1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Q 1,234 · deleted' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save as draft' })).toBeNull();
    expect(field('Explanation').closest('fieldset')?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
  });

  it('a new subject: 409 selects the existing one instead of creating a duplicate', async () => {
    serve((call) =>
      call.method === 'POST' && call.path.endsWith('/subjects') ? jsonResponse({ status: 409, detail: 'exists', id: 's2' }, 409, 'application/problem+json') : undefined,
    );
    renderEditor(null);
    await ready();
    fireEvent.change(field('Subject'), { target: { value: '__new__' } });
    const name = await screen.findByLabelText('New subject name');
    expect(document.activeElement).toBe(name);
    fireEvent.change(name, { target: { value: 'science' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(field('Subject').value).toBe('s2'));
    expect(screen.queryByLabelText('New subject name')).toBeNull();
  });

  it('a new topic is created under the chosen subject and selected', async () => {
    serve((call) => (call.method === 'POST' && call.path.endsWith('/topics') ? jsonResponse({ id: 't9' }, 201) : undefined));
    renderEditor(null);
    await ready();
    fireEvent.change(field('Subject'), { target: { value: 's1' } });
    fireEvent.change(field('Topic'), { target: { value: '__new__' } });
    fireEvent.change(await screen.findByLabelText('New topic name'), { target: { value: 'Rivers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(field('Topic').value).toBe('t9'));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/api/core/v1/admin/subjects/s1/topics', body: { name: 'Rivers' } });
  });

  it('creating a question navigates to its editor and carries the saved line', async () => {
    serve((call) => (call.method === 'POST' ? jsonResponse({ questionId: 'new1', displayNo: 9, version: 1, status: 'DRAFT', rowVersion: 0 }, 201) : undefined));
    renderEditor(null);
    await ready();
    fireEvent.change(field('Subject'), { target: { value: 's1' } });
    fireEvent.change(field('Topic'), { target: { value: 't1' } });
    fireEvent.change(field('Exam level'), { target: { value: 'TENTH' } });
    fireEvent.change(field('Difficulty'), { target: { value: 'EASY' } });
    fireEvent.change(field('English text'), { target: { value: 'Q?' } });
    ['A1', 'B1', 'C1', 'D1'].forEach((text, i) => fireEvent.change(field(`Option ${'ABCD'[i]}`), { target: { value: text } }));
    fireEvent.click(within(screen.getByRole('radiogroup')).getByLabelText('B'));
    fireEvent.change(field('Explanation'), { target: { value: 'Because.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => expect(window.location.pathname).toBe('/admin/questions/new1/edit'));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ answerIndex: 1, options: ['A1', 'B1', 'C1', 'D1'], subjectId: 's1' });
  });
});
