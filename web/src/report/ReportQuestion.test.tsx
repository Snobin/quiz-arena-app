import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n.ts';
import i18n from '../i18n.ts';
import * as lastResult from '../realtime/lastResult.ts';
import { resetReportState } from './reportState.ts';
import { resetAnnouncements, useAnnouncements } from '../shell/announce.ts';

const mocks = vi.hoisted(() => ({ status: 'registered', online: true, apiFetch: vi.fn() }));
vi.mock('../auth/session.ts', () => ({ useSession: (select: (s: { status: string }) => unknown) => select({ status: mocks.status }) }));
vi.mock('../auth/apiFetch.ts', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../shell/online.ts', () => ({ useOnline: () => mocks.online }));

import { BreakdownRow } from '../screens/results/BreakdownRow.tsx';
import { ReportQuestion, type ReportQuestionProps } from './ReportQuestion.tsx';

const BASE: ReportQuestionProps = { questionId: 'q-1', version: 2, surface: 'RESULTS', matchId: 'm-1', questionSource: 'BANK' };

function reply(status: number, body: unknown = {}) {
  mocks.apiFetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

async function openNote() {
  fireEvent.click(screen.getByTestId('report-link'));
  return (await screen.findByLabelText("What's wrong? (optional)")) as HTMLTextAreaElement;
}

beforeEach(async () => {
  mocks.status = 'registered';
  mocks.online = true;
  mocks.apiFetch.mockReset();
  resetAnnouncements();
  resetReportState();
  window.sessionStorage.clear();
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

describe('ReportQuestion', () => {
  it('shows nothing for a guest or a custom-topic question', () => {
    mocks.status = 'guest';
    const { rerender } = render(<ReportQuestion {...BASE} />);
    expect(screen.queryByTestId('report-link')).toBeNull();
    mocks.status = 'registered';
    rerender(<ReportQuestion {...BASE} questionSource="CUSTOM" />);
    expect(screen.queryByTestId('report-link')).toBeNull();
    rerender(<ReportQuestion {...BASE} questionSource={null} />);
    expect(screen.queryByTestId('report-link')).toBeNull();
  });

  it('opens a labelled note field with a live count, focuses it, and sends the exact version with the surface', async () => {
    render(<ReportQuestion {...BASE} />);
    const link = screen.getByTestId('report-link');
    expect(link.className).toContain('min-h-target-min');
    const note = await openNote();
    expect(document.activeElement).toBe(note);
    fireEvent.change(note, { target: { value: 'wrong answer' } });
    expect(screen.getByTestId('report-count').textContent).toBe('12 / 500');
    expect(note.maxLength).toBe(500);
    reply(201);
    fireEvent.click(screen.getByTestId('report-send'));
    const thanks = await screen.findByTestId('report-thanks');
    const [url, init] = mocks.apiFetch.mock.calls[0]!;
    expect(String(url)).toBe('/api/core/v1/questions/q-1/versions/2/reports');
    expect(JSON.parse(String(init.body))).toEqual({ note: 'wrong answer', surface: 'RESULTS', matchId: 'm-1' });
    expect(document.activeElement).toBe(thanks);
    expect(useAnnouncements.getState().polite.text).toContain('Thanks, we got your report');
    expect(screen.queryByTestId('report-link')).toBeNull();
    expect(screen.queryByLabelText("What's wrong? (optional)")).toBeNull();
  });

  it('a 409 says it was already reported in place of the note field', async () => {
    render(<ReportQuestion {...BASE} />);
    await openNote();
    reply(409);
    fireEvent.click(screen.getByTestId('report-send'));
    expect((await screen.findByTestId('report-duplicate')).textContent).toBe("You've already reported this question");
    expect(screen.queryByTestId('report-link')).toBeNull();
  });

  it('a 429 shows the inline error linked by aria-describedby and keeps the typed note', async () => {
    render(<ReportQuestion {...BASE} />);
    const note = await openNote();
    fireEvent.change(note, { target: { value: 'keep me' } });
    reply(429);
    fireEvent.click(screen.getByTestId('report-send'));
    const error = await screen.findByTestId('report-error');
    expect(error.textContent).toContain('Too many reports. Try again in a few minutes.');
    expect(note.getAttribute('aria-describedby')).toContain(error.id);
    expect(note.value).toBe('keep me');
  });

  it('a network failure or 5xx keeps the note and offers Retry, which sends again', async () => {
    render(<ReportQuestion {...BASE} />);
    const note = await openNote();
    fireEvent.change(note, { target: { value: 'again' } });
    mocks.apiFetch.mockRejectedValueOnce(new TypeError('offline'));
    fireEvent.click(screen.getByTestId('report-send'));
    await screen.findByTestId('report-error');
    expect(note.value).toBe('again');
    reply(201);
    const retry = screen.getByTestId('report-send');
    expect(retry.textContent).toBe('Retry');
    fireEvent.click(retry);
    await screen.findByTestId('report-thanks');
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
  });

  it('offline: Send report is aria-disabled with the offline caption and sends nothing', async () => {
    mocks.online = false;
    render(<ReportQuestion {...BASE} />);
    await openNote();
    const send = screen.getByTestId('report-send');
    expect(send.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Reporting needs an internet connection')).toBeTruthy();
    fireEvent.click(send);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('Cancel closes the note field and returns focus to the link', async () => {
    render(<ReportQuestion {...BASE} />);
    await openNote();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByTestId('report-note')).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId('report-link'));
  });

  it('live reveal: the tap only marks (nothing sent), announces it politely, and shows the marked line', async () => {
    const onMark = vi.fn();
    const { rerender } = render(<ReportQuestion {...BASE} surface="LIVE_REVEAL" onMark={onMark} />);
    fireEvent.click(screen.getByTestId('report-link'));
    await act(async () => {});
    expect(onMark).toHaveBeenCalledOnce();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('report-note')).toBeNull();
    expect(useAnnouncements.getState().polite.text).toContain('Marked · add a note on results');
    rerender(<ReportQuestion {...BASE} surface="LIVE_REVEAL" onMark={onMark} marked />);
    expect(screen.getByTestId('report-marked').textContent).toBe('Marked · add a note on results');
  });
});

describe('ReportQuestion failures and guards', () => {
  it('a 400 on the note shows the too-long text; a 400 on another field shows the generic failure', async () => {
    render(<ReportQuestion {...BASE} />);
    await openNote();
    reply(400, { errors: [{ field: 'note', problem: 'too long' }] });
    fireEvent.click(screen.getByTestId('report-send'));
    expect((await screen.findByTestId('report-error')).textContent).toContain('at most 500 characters');
    reply(400, { errors: [{ field: 'matchId', problem: 'too long' }] });
    fireEvent.click(screen.getByTestId('report-send'));
    await waitFor(() => expect(screen.getByTestId('report-error').textContent).toContain("Couldn't send your report"));
  });

  it('a 5xx shows the generic failure with Retry and keeps the note', async () => {
    render(<ReportQuestion {...BASE} />);
    const note = await openNote();
    fireEvent.change(note, { target: { value: 'keep' } });
    reply(503);
    fireEvent.click(screen.getByTestId('report-send'));
    expect((await screen.findByTestId('report-error')).textContent).toContain("Couldn't send your report");
    expect(screen.getByTestId('report-send').textContent).toBe('Retry');
    expect(note.value).toBe('keep');
  });

  it('a double click sends once, and Cancel is aria-disabled while sending', async () => {
    render(<ReportQuestion {...BASE} />);
    await openNote();
    let finish: (r: Response) => void = () => {};
    mocks.apiFetch.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    const send = screen.getByTestId('report-send');
    fireEvent.click(send);
    fireEvent.click(send);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Cancel').getAttribute('aria-disabled')).toBe('true');
    await act(async () => finish(new Response('{}', { status: 201 })));
    await screen.findByTestId('report-thanks');
  });

  it('a sent report removes the mark, so a reload does not reopen the field', async () => {
    lastResult.saveMark('m-1', 'q-1', 2);
    render(<ReportQuestion {...BASE} startOpen />);
    reply(201);
    fireEvent.click(await screen.findByTestId('report-send'));
    await screen.findByTestId('report-thanks');
    expect(lastResult.loadMarks('m-1')).toEqual([]);
  });
});

describe('report state survives a collapsed row', () => {
  const question = { questionId: 'q-1', version: 2, textEn: 'Q?', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'Because', attribution: null };
  const answer = { pickedIndex: 0, correct: true, responseMs: 3000, points: 900 };
  const row = <ol><BreakdownRow index={0} question={question} answer={answer} report={{ matchId: 'm-1', questionSource: 'BANK', marked: false }} /></ol>;
  const toggle = () => fireEvent.click(screen.getAllByRole('button', { expanded: undefined }).find((b) => b.getAttribute('aria-controls'))!);

  it('a typed unsent note is still there after collapsing and re-expanding', async () => {
    render(row);
    toggle();
    const note = await openNote();
    fireEvent.change(note, { target: { value: 'draft' } });
    toggle();
    expect(screen.queryByTestId('report-note')).toBeNull();
    toggle();
    expect(((await screen.findByLabelText("What's wrong? (optional)")) as HTMLTextAreaElement).value).toBe('draft');
  });

  it('after a successful report the link does not come back', async () => {
    render(row);
    toggle();
    await openNote();
    reply(201);
    fireEvent.click(screen.getByTestId('report-send'));
    await screen.findByTestId('report-thanks');
    toggle();
    toggle();
    expect(screen.queryByTestId('report-link')).toBeNull();
    expect(screen.queryByTestId('report-note')).toBeNull();
  });
});

describe('report marks', () => {
  it('are kept per match in sessionStorage and dropped with the stored result', () => {
    lastResult.saveMark('m-1', 'q-1', 2);
    expect(lastResult.loadMarks('m-1')).toEqual(['q-1:2']);
    expect(lastResult.loadMarks('m-2')).toEqual([]);
    lastResult.clear();
    expect(lastResult.loadMarks('m-1')).toEqual([]);
  });
});

describe('BreakdownRow report', () => {
  const question = { questionId: 'q-1', version: 2, textEn: 'Q?', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'Because', attribution: null };
  const answer = { pickedIndex: 0, correct: true, responseMs: 3000, points: 900 };

  it('a correct row stays collapsed until opened; then its link reports with surface RESULTS', async () => {
    render(<ol><BreakdownRow index={0} question={question} answer={answer} report={{ matchId: 'm-1', questionSource: 'BANK', marked: false }} /></ol>);
    expect(screen.queryByTestId('report-link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    await openNote();
    reply(201);
    fireEvent.click(screen.getByTestId('report-send'));
    await screen.findByTestId('report-thanks');
    expect(JSON.parse(String(mocks.apiFetch.mock.calls[0]![1].body)).surface).toBe('RESULTS');
  });

  it('a row marked during the live reveal opens expanded with the note field ready and surface LIVE_REVEAL', async () => {
    render(<ol><BreakdownRow index={0} question={question} answer={answer} report={{ matchId: 'm-1', questionSource: 'BANK', marked: true }} /></ol>);
    const note = await screen.findByLabelText("What's wrong? (optional)");
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(2); // the row header and the report link
    fireEvent.change(note, { target: { value: 'x' } });
    reply(201);
    fireEvent.click(screen.getByTestId('report-send'));
    await screen.findByTestId('report-thanks');
    expect(JSON.parse(String(mocks.apiFetch.mock.calls[0]![1].body)).surface).toBe('LIVE_REVEAL');
  });

  it('a custom-topic match shows no link', () => {
    render(<ol><BreakdownRow index={0} question={question} answer={{ ...answer, correct: false, pickedIndex: 1, points: 0 }} report={{ matchId: 'm-1', questionSource: 'CUSTOM', marked: false }} /></ol>);
    expect(screen.queryByTestId('report-link')).toBeNull();
  });
});
