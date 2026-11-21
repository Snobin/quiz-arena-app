import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n.ts';
import { parseResultQuestion, type ResultQuestion } from '../../realtime/protocol.ts';

const mocks = vi.hoisted(() => ({
  online: true,
  apiFetch: vi.fn(),
  navigate: vi.fn(),
  cancelRematch: vi.fn(),
}));
vi.mock('../../auth/apiFetch.ts', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../../auth/session.ts', () => ({ useSession: (select: (s: { status: string }) => unknown) => select({ status: 'registered' }) }));
vi.mock('../../shell/online.ts', () => ({ useOnline: () => mocks.online }));
vi.mock('../../shell/router.ts', () => ({ navigate: mocks.navigate }));
vi.mock('../../realtime/liveGameStore.ts', () => ({ cancelRematch: mocks.cancelRematch }));

import { BreakdownRow } from './BreakdownRow.tsx';

const TOPIC = '11111111-1111-4111-8111-111111111111';
const QUESTION: ResultQuestion = {
  questionId: 'q-3',
  version: 1,
  textEn: 'Q',
  options: ['a', 'b', 'c', 'd'],
  answerIndex: 0,
  explanation: 'x',
  attribution: null,
  topicId: TOPIC,
};
const WRONG = { pickedIndex: 1, correct: false, responseMs: 3000, points: 0 };
const RIGHT = { pickedIndex: 0, correct: true, responseMs: 3000, points: 800 };
const REPORT = { matchId: 'm-1', questionSource: 'BANK' as const, marked: false };

let client: QueryClient;
function row(props: Partial<Parameters<typeof BreakdownRow>[0]> = {}) {
  return render(
    <QueryClientProvider client={client}>
      <BreakdownRow index={2} question={QUESTION} answer={WRONG} report={REPORT} practise {...props} />
    </QueryClientProvider>,
  );
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const link = () => screen.findByRole('button', { name: 'Practise this topic, question 3' });

beforeEach(async () => {
  mocks.online = true;
  mocks.apiFetch.mockReset();
  mocks.navigate.mockReset();
  mocks.cancelRematch.mockReset();
  window.sessionStorage.clear();
  client = new QueryClient();
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

describe('Practise this topic', () => {
  it('starts a session, stores it, notes the topic and opens practice', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(json(201, { sessionId: 's-1', source: { type: 'BANK', topicId: TOPIC, topicName: 'T', subjectName: 'S' }, poolSize: 20 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    row();
    fireEvent.click(await link());
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(`/practice/${TOPIC}`));
    expect(mocks.cancelRematch).toHaveBeenCalled();
    expect(JSON.parse(window.sessionStorage.getItem(`minnal.practice.${TOPIC}`)!)).toEqual({ sessionId: 's-1', answered: 0, correct: 0 });
    const calls = mocks.apiFetch.mock.calls.map((c) => [String(c[0]), (c[1] as RequestInit).method]);
    expect(calls[0]).toEqual([expect.stringContaining('/api/core/v1/solo/sessions'), 'POST']);
    expect(calls[1]).toEqual([expect.stringContaining(`/me/recent-topics/${TOPIC}`), 'PUT']);
  });

  it('sends a 422 to the solo picker with the small-topic notice and invalidates the catalogue', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mocks.apiFetch.mockResolvedValueOnce(json(422, { type: 'about:blank#topic-unavailable', detail: 'raw' }));
    row();
    fireEvent.click(await link());
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/play/topics?for=solo&notice=small'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['topics'] });
    expect(screen.queryByText('raw')).toBeNull();
  });

  it('treats a 404 the same way', async () => {
    mocks.apiFetch.mockResolvedValueOnce(json(404, {}));
    row();
    fireEvent.click(await link());
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/play/topics?for=solo&notice=small'));
  });

  it('shows one inline error with Retry on a 5xx or network failure, and Retry then succeeds', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(json(503, {}))
      .mockRejectedValueOnce(new TypeError('x'))
      .mockResolvedValueOnce(json(201, { sessionId: 's-2', source: { type: 'BANK', topicId: TOPIC, topicName: 'T', subjectName: 'S' }, poolSize: 20 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    row();
    fireEvent.click(await link());
    expect(await screen.findByTestId('practise-error')).toBeTruthy();
    expect(mocks.navigate).not.toHaveBeenCalled();
    // The row stays open and its content intact.
    expect(screen.getByTestId('row-details')).toBeTruthy();
    fireEvent.click(screen.getByTestId('practise-retry'));
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('practise-error')).toBeTruthy();
    fireEvent.click(screen.getByTestId('practise-retry'));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(`/practice/${TOPIC}`));
    expect(JSON.parse(window.sessionStorage.getItem(`minnal.practice.${TOPIC}`)!).sessionId).toBe('s-2');
    expect(screen.queryByTestId('practise-error')).toBeNull();
  });

  it('is aria-disabled with a caption offline and ignores taps', async () => {
    mocks.online = false;
    row();
    const button = await link();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Playing needs an internet connection')).toBeTruthy();
    fireEvent.click(button);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('reads "…" while pending and ignores further taps', async () => {
    let resolve: (r: Response) => void = () => undefined;
    mocks.apiFetch.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));
    row();
    const button = await link();
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe('…'));
    fireEvent.click(button);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    resolve(json(503, {}));
    await screen.findByTestId('practise-error');
  });

  it.each([
    ['a guest or not rated for her', { practise: false }],
    ['a null topic', { question: { ...QUESTION, topicId: undefined } }],
    ['a collapsed correct row', { answer: RIGHT }],
  ])('hides the link for %s', async (_name, props) => {
    row(props);
    await Promise.resolve();
    expect(screen.queryByTestId('practise-link')).toBeNull();
    expect(screen.queryByRole('button', { name: /Practise this topic/ })).toBeNull();
  });

  it('shows the link on an expanded correct row, apart from the report link', async () => {
    row({ answer: RIGHT });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(await link()).toBeTruthy();
    expect(screen.getByTestId('report-link')).not.toBe(screen.getByTestId('practise-link'));
  });
});

describe('ResultQuestion topicId', () => {
  it('parses when present and is absent for an older result', () => {
    const wire = { questionId: 'q', version: 1, textEn: 'Q', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: 'x' };
    expect(parseResultQuestion(wire)!.topicId).toBeUndefined();
    expect(parseResultQuestion({ ...wire, topicId: TOPIC })!.topicId).toBe(TOPIC);
  });
});
