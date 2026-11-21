import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import i18n from '../../i18n.ts';
import { joinQuickMatch, resetRealtime } from '../../realtime/connection.ts';
import { liveGameStore } from '../../realtime/liveGameStore.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { resetProfile, useProfile } from '../../profile/profileStore.ts';
import { resetReportState } from '../../report/reportState.ts';
import { resetAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { restartGuestSession, stubFetch } from '../../test-utils/guest.ts';
import { matchEnded, matchFound, questionRevealed, questionStarted, useFakeRealtime, type FakeStomp } from '../../test-utils/realtime.ts';
import { RESULTS_HOLD_MS } from './LiveMatchScreen.tsx';

/** Story 3.5 through the real screens: a registered player on a BANK match. */

const mocks = vi.hoisted(() => ({ status: 'registered' }));
vi.mock('../../auth/session.ts', async (original) => ({
  ...(await original<typeof import('../../auth/session.ts')>()),
  useSession: (select: (s: { status: string; name: string | null; signedOut: boolean }) => unknown) =>
    select({ status: mocks.status, name: 'Anju', signedOut: false }),
}));
vi.mock('../../motion/flashScheduler.ts', () => ({ requestFlash: () => () => {}, resetFlashScheduler: () => {} }));

let clients: FakeStomp[];
const socket = () => clients[clients.length - 1]!;

type Match = { matchId: string; self: string; opponent: string; seq: number };

async function inMatch(): Promise<Match> {
  joinQuickMatch();
  await waitFor(() => expect(clients).toHaveLength(1));
  act(() => socket().open());
  const message = matchFound({ name: 'Vishnu R', kind: 'GUEST' });
  act(() => socket().deliver(message));
  const { matchId, selfParticipantId, participants } = message.payload;
  const opponent = participants.find((p) => p.participantId !== selfParticipantId)!.participantId;
  window.history.pushState(null, '', '/match');
  syncFromLocation();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <App />
    </QueryClientProvider>,
  );
  return { matchId, self: selfParticipantId, opponent, seq: 0 };
}

function revealQuestion(m: Match, index: number) {
  m.seq += 1;
  act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: m.seq, questionIndex: index, startedAt: Date.now() })));
  m.seq += 1;
  act(() =>
    socket().deliverTopic(
      m.matchId,
      questionRevealed(m.matchId, {
        seq: m.seq,
        questionIndex: index,
        answerIndex: 0,
        results: [
          { participantId: m.self, pickedIndex: 0, correct: true, points: 800, totalScore: 800 },
          { participantId: m.opponent, pickedIndex: 1, correct: false, points: 0, totalScore: 0 },
        ],
      }),
    ),
  );
}

function deliverEnded(m: Match) {
  const answers = Array.from({ length: 10 }, () => ({ pickedIndex: 0, correct: true, responseMs: 4000, points: 314 }));
  act(() =>
    socket().deliver(
      matchEnded(m.matchId, {
        participants: [
          { participantId: m.self, displayName: 'Guest 4821', kind: 'GUEST', score: 3140, correctCount: 10, placement: 1 },
          { participantId: m.opponent, displayName: 'Vishnu R', kind: 'GUEST', score: 1980, correctCount: 6, placement: 2 },
        ],
        breakdown: { [m.self]: answers, [m.opponent]: answers },
      }),
    ),
  );
}

beforeEach(async () => {
  mocks.status = 'registered';
  stubFetch();
  restartGuestSession();
  clients = useFakeRealtime();
  window.sessionStorage.clear();
  resetReportState();
  // A registered player's profile is already loaded and complete, so the app does not hold her on a loading view.
  useProfile.setState({ status: 'ready', profile: { displayName: 'Anju', district: null, examLevel: null, language: 'en', profileComplete: true } });
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  cleanup();
  resetProfile();
  vi.useRealTimers();
  resetRealtime();
  guestSession.reset();
  clearReturnFocus();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  await act(() => i18n.changeLanguage('ml'));
});

describe('report link on the live reveal', () => {
  it('shows after the reveal (not before), and a tap persists the mark without sending anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const m = await inMatch();
    m.seq += 1;
    act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: m.seq, questionIndex: 0, startedAt: Date.now() })));
    expect(screen.queryByTestId('report-link')).toBeNull();
    revealQuestion(m, 0);
    const calls = fetchSpy.mock.calls.length;
    fireEvent.click(await screen.findByTestId('report-link'));
    expect(screen.getByTestId('report-marked')).toHaveTextContent('Marked · add a note on results');
    expect(lastResult.loadMarks(m.matchId)).toEqual(['q-0:1']);
    expect(fetchSpy.mock.calls.length).toBe(calls);
    expect(screen.queryByTestId('report-note')).toBeNull();
  });

  it('shows no link for a guest', async () => {
    mocks.status = 'guest';
    const m = await inMatch();
    revealQuestion(m, 0);
    expect(screen.getByTestId('reveal-details')).toBeInTheDocument();
    expect(screen.queryByTestId('report-link')).toBeNull();
  });

  it('shows no link when the source is unknown (a rejoined match)', async () => {
    const m = await inMatch();
    act(() => liveGameStore.setState((s) => ({ live: { ...s.live!, questionSource: null } })));
    revealQuestion(m, 0);
    expect(screen.getByTestId('reveal-details')).toBeInTheDocument();
    expect(screen.queryByTestId('report-link')).toBeNull();
  });
});

describe('report on the results', () => {
  it('the marked question opens expanded with the note field ready; the others stay collapsed', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    revealQuestion(m, 9); // the last question: its reveal hold opens the results
    fireEvent.click(screen.getByTestId('report-link'));
    deliverEnded(m);
    await act(() => vi.advanceTimersByTimeAsync(RESULTS_HOLD_MS + 100));
    expect(window.location.pathname).toBe('/results');
    vi.useRealTimers();
    expect(await screen.findAllByLabelText("What's wrong? (optional)")).toHaveLength(1);
    const rows = screen.getAllByTestId('breakdown-row');
    expect(rows[9]!.querySelector('[data-testid="report-note"]')).not.toBeNull();
    expect(rows[0]!.querySelector('[data-testid="report-note"]')).toBeNull();
  });

  it('a stored result with no source from core hides nothing wrongly: a CUSTOM match shows no link', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const ended = matchEnded(m.matchId, {
      participants: [
        { participantId: m.self, displayName: 'Guest 4821', kind: 'GUEST', score: 1, correctCount: 1, placement: 1 },
        { participantId: m.opponent, displayName: 'Vishnu R', kind: 'GUEST', score: 0, correctCount: 0, placement: 2 },
      ],
      breakdown: { [m.self]: [{ pickedIndex: 1, correct: false, responseMs: 1000, points: 0 }], [m.opponent]: [{ correct: false, points: 0 }] },
    });
    (ended.payload as { questionSource: string }).questionSource = 'CUSTOM';
    revealQuestion(m, 9);
    act(() => socket().deliver(ended));
    await act(() => vi.advanceTimersByTimeAsync(RESULTS_HOLD_MS + 100));
    expect(window.location.pathname).toBe('/results');
    expect(screen.getAllByTestId('breakdown-row').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('report-link')).toBeNull();
  });
});
