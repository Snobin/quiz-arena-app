import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import i18n from '../../i18n.ts';
import { joinQuickMatch, resetRealtime } from '../../realtime/connection.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { liveGameStore } from '../../realtime/liveGameStore.ts';
import * as liveMatchId from '../../realtime/liveMatchId.ts';
import { matchAnswer, matchLeave, matchResync, matchTopic, parseMatchEnded } from '../../realtime/protocol.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { navigate, syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { restartGuestSession, stubFetch } from '../../test-utils/guest.ts';
import {
  matchAborted,
  matchEnded,
  matchFound,
  participantForfeited,
  questionRevealed,
  questionStarted,
  serverError,
  snapshot,
  useFakeRealtime,
  type FakeStomp,
} from '../../test-utils/realtime.ts';
import { FORFEIT_NOTICE_MS, MATCH_ENDED_WAIT_MS, RESULTS_HOLD_MS } from './LiveMatchScreen.tsx';

/** Story 1.9 on the screens: the reconnect banner, the Leave dialog, the notices and /results. */

let clients: FakeStomp[];
const socket = () => clients[clients.length - 1]!;
const flushAnnouncements = () => act(async () => {});
const politeText = () => useAnnouncements.getState().polite.text;
const assertiveText = () => useAnnouncements.getState().assertive.text;

type Match = {
  matchId: string;
  self: string;
  opponent: string;
  seq: number;
  participants: { participantId: string; displayName: string; kind: string }[];
};

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

async function inMatch(opponent: { name: string; kind: 'BOT' | 'GUEST' } = { name: 'Vishnu R', kind: 'GUEST' }): Promise<Match> {
  joinQuickMatch();
  await waitFor(() => expect(clients).toHaveLength(1));
  act(() => socket().open());
  const message = matchFound(opponent);
  act(() => socket().deliver(message));
  const { matchId, selfParticipantId, participants } = message.payload;
  const other = participants.find((p) => p.participantId !== selfParticipantId)!.participantId;
  renderApp('/match');
  await screen.findByTestId('score-strip');
  return { matchId, self: selfParticipantId, opponent: other, seq: 0, participants };
}

function start(m: Match, questionIndex: number) {
  m.seq += 1;
  act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: m.seq, questionIndex, startedAt: Date.now() })));
}

function revealQ(m: Match, questionIndex: number, selfTotal: number, opponentTotal: number) {
  m.seq += 1;
  act(() =>
    socket().deliverTopic(
      m.matchId,
      questionRevealed(m.matchId, {
        seq: m.seq,
        questionIndex,
        answerIndex: 0,
        results: [
          { participantId: m.self, pickedIndex: 0, correct: true, points: selfTotal, totalScore: selfTotal },
          { participantId: m.opponent, pickedIndex: 1, correct: false, points: 0, totalScore: opponentTotal },
        ],
      }),
    ),
  );
}

function broadcast(m: Match, frame: (seq: number) => unknown) {
  m.seq += 1;
  const seq = m.seq;
  act(() => socket().deliverTopic(m.matchId, frame(seq)));
}

const content = () => screen.getByTestId('match-content');

beforeEach(async () => {
  stubFetch();
  restartGuestSession();
  clients = useFakeRealtime();
  Element.prototype.animate = function () {
    return {} as Animation;
  } as unknown as Element['animate'];
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  vi.useRealTimers();
  resetRealtime();
  guestSession.reset();
  clearReturnFocus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  delete (Element.prototype as { animate?: unknown }).animate;
  await act(() => i18n.changeLanguage('ml'));
});

describe('reconnect banner', () => {
  it('replaces the timer, dims and inerts the content, announces once each way, and the SNAPSHOT resumes the question', async () => {
    const m = await inMatch();
    start(m, 3);
    expect(content()).not.toHaveAttribute('inert');
    act(() => socket().drop());

    const banner = screen.getByTestId('reconnect-banner');
    expect(banner).toHaveTextContent('Reconnecting… 10');
    expect(within(banner).getByTestId('reconnect-ring')).toHaveTextContent('10');
    expect(banner.className).not.toMatch(/volt|brick|animate/);
    expect(screen.getByTestId('top-bar').parentElement).toHaveAttribute('hidden');
    expect(content()).toHaveAttribute('inert');
    expect(content()).toHaveAttribute('aria-hidden', 'true');
    expect(content().className).toContain('opacity-[0.42]');
    await flushAnnouncements();
    expect(assertiveText()).toBe('Reconnecting… 10');
    const assertiveSeq = useAnnouncements.getState().assertive.seq;

    // The retry opens a new socket, which resyncs.
    await waitFor(() => expect(clients).toHaveLength(2), { timeout: 2000 });
    act(() => socket().open());
    expect(socket().sentTo(matchResync(m.matchId))).toBe(1);
    act(() =>
      socket().deliver(
        snapshot(m.matchId, {
          refSeq: m.seq,
          questionIndex: 3,
          startedAt: Date.now() - 6000,
          scores: [{ participantId: m.self, score: 2140 }, { participantId: m.opponent, score: 1310 }],
          participants: m.participants,
          myAnswer: { pickedIndex: 2, correct: false, points: 0, answerIndex: 0, totalScore: 2140 },
        }),
      ),
    );
    expect(screen.queryByTestId('reconnect-banner')).toBeNull();
    expect(content()).not.toHaveAttribute('inert');
    expect(content()).not.toHaveAttribute('aria-hidden');
    expect(screen.getByTestId('self-total')).toHaveTextContent('2,140');
    expect(screen.getByTestId('progress')).toHaveTextContent('Q 4/10');
    // Her 1v1 band is restored from the snapshot.
    expect(screen.getByTestId('footer')).toHaveTextContent('Waiting for Vishnu R…');
    await flushAnnouncements();
    expect(politeText()).toContain("You're back in the match");
    expect(useAnnouncements.getState().assertive.seq).toBe(assertiveSeq);
  });

  it('the ring running out offline shows Forfeited, then the results with her earned score', async () => {
    const m = await inMatch();
    start(m, 0);
    revealQ(m, 0, 900, 0);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() => socket().drop());
    // Every reconnect attempt fails.
    for (let i = 0; i < 25; i++) {
      await act(() => vi.advanceTimersByTimeAsync(500));
      if (!socket().connected && screen.queryByTestId('reconnect-banner')) act(() => socket().drop());
    }
    await vi.waitFor(() => expect(screen.getByTestId('notice-forfeited')).toHaveTextContent('You left · Vishnu R wins'));
    expect(screen.queryByTestId('reconnect-banner')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(FORFEIT_NOTICE_MS));
    expect(window.location.pathname).toBe('/results');
    await vi.waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Results'));
    expect(screen.getByTestId('result-self')).toHaveTextContent('You');
    expect(screen.getByTestId('result-self')).toHaveTextContent('900');
    expect(screen.getByTestId('notice-forfeited')).toBeInTheDocument();
  });
});

describe('leave', () => {
  it('the Leave text button opens the alertdialog with focus on Stay; Esc stays and focus returns to the heading', async () => {
    const m = await inMatch();
    start(m, 2);
    const leaveButton = screen.getByTestId('leave-button');
    expect(leaveButton).toHaveTextContent('Leave');
    expect(leaveButton.className).toContain('min-h-target-min');
    expect(leaveButton.className).toContain('text-brick');
    fireEvent.click(leaveButton);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName("Leave? You'll forfeit the remaining questions");
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Stay' })).toHaveFocus());
    expect(content()).toHaveAttribute('inert');
    expect(content().className).toContain('opacity-[0.42]');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus());
    expect(socket().sentTo(matchLeave(m.matchId))).toBe(0);
  });

  it('confirming Leave forfeits and opens the results with the score earned so far', async () => {
    const m = await inMatch();
    start(m, 0);
    revealQ(m, 0, 800, 600);
    start(m, 1);
    fireEvent.click(screen.getByTestId('leave-button'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Leave' }));
    expect(socket().sentTo(matchLeave(m.matchId))).toBe(1);
    broadcast(m, (seq) => participantForfeited(m.matchId, seq, m.self, 1));
    await waitFor(() => expect(window.location.pathname).toBe('/results'));
    expect(screen.getByTestId('result-self')).toHaveTextContent('800');
    expect(screen.getByTestId('result-row')).toHaveTextContent('Vishnu R');
    expect(screen.getByTestId('result-row')).toHaveTextContent('600');
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(window.location.pathname).toBe('/');
  });

  it('Android back opens the dialog, and Back again means Stay', async () => {
    const m = await inMatch();
    start(m, 0);
    act(() => window.history.back());
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/match');
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(window.location.pathname).toBe('/match');
  });

  it('leaving before the first reveal against the bot aborts: Home with the notice, announced once', async () => {
    const m = await inMatch({ name: 'Minnal Bot', kind: 'BOT' });
    start(m, 0);
    fireEvent.click(screen.getByTestId('leave-button'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Leave' }));
    broadcast(m, (seq) => participantForfeited(m.matchId, seq, m.self, 0));
    broadcast(m, (seq) => matchAborted(m.matchId, seq));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(await screen.findByTestId('notice-aborted')).toHaveTextContent("The match was called off and won't count");
    await flushAnnouncements();
    expect(politeText()).toContain("The match was called off and won't count");
  });
});

describe('notices', () => {
  it('a 1v1 opponent who left: the strip says "left", a one-line "you win" notice, announced once', async () => {
    const m = await inMatch();
    start(m, 0);
    broadcast(m, (seq) => participantForfeited(m.matchId, seq, m.opponent, 0));
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('left');
    expect(screen.getByTestId('notice-opponent-left')).toHaveTextContent('Vishnu R left · you win');
    await flushAnnouncements();
    expect(politeText()).toContain('Vishnu R left · you win');
    const seq = useAnnouncements.getState().polite.seq;
    start(m, 1);
    await flushAnnouncements();
    expect(useAnnouncements.getState().polite.seq).toBe(seq);
    expect(screen.getByTestId('leave-button')).toBeInTheDocument();
    expect(content()).not.toHaveAttribute('inert');
  });

  it('a 1v1 opponent who left ends the match: MATCH_ENDED opens the results after the reveal hold', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    start(m, 2);
    broadcast(m, (seq) => participantForfeited(m.matchId, seq, m.opponent, 2));
    revealQ(m, 2, 900, 0);
    const answers = Array.from({ length: 3 }, () => ({ pickedIndex: 0, correct: true, responseMs: 3000, points: 300 }));
    act(() =>
      socket().deliver(
        matchEnded(m.matchId, {
          participants: [
            { participantId: m.self, displayName: 'Guest 4821', kind: 'GUEST', score: 900, correctCount: 3, placement: 1 },
            { participantId: m.opponent, displayName: 'Vishnu R', kind: 'GUEST', score: 1200, correctCount: 4, forfeited: true, placement: 2 },
          ],
          breakdown: { [m.self]: answers, [m.opponent]: answers },
        }),
      ),
    );
    expect(window.location.pathname).toBe('/match');
    await act(() => vi.advanceTimersByTimeAsync(RESULTS_HOLD_MS + 100));
    expect(window.location.pathname).toBe('/results');
  });

  it('a handler error abort sends her Home with the notice', async () => {
    const m = await inMatch();
    start(m, 4);
    broadcast(m, (seq) => matchAborted(m.matchId, seq, 'ERROR'));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.getByTestId('notice-aborted')).toBeInTheDocument();
  });
});

describe('the end', () => {
  it('a match that ended while she was away (NOT_IN_MATCH after Q1) opens the results, not a stuck screen', async () => {
    const m = await inMatch();
    start(m, 0);
    revealQ(m, 0, 900, 300);
    start(m, 1);
    act(() => socket().drop());
    await waitFor(() => expect(clients).toHaveLength(2), { timeout: 2000 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() => socket().open());
    act(() => socket().deliver(serverError('NOT_IN_MATCH', m.matchId)));
    expect(screen.queryByTestId('reconnect-banner')).toBeNull();
    expect(content()).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('leave-button')).toBeNull();
    expect(window.location.pathname).toBe('/match');
    // The Back guard entry is dropped once play ends here.
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect((window.history.state as { minnalGuard?: boolean } | null)?.minnalGuard).not.toBe(true);
    // No MATCH_ENDED is coming: after the hold and the wait, the minimal results.
    await act(() => vi.advanceTimersByTimeAsync(RESULTS_HOLD_MS + 50));
    await act(() => vi.advanceTimersByTimeAsync(MATCH_ENDED_WAIT_MS + 50));
    expect(window.location.pathname).toBe('/results');
    expect(screen.getByTestId('result-self')).toHaveTextContent('900');
    // /results replaced /match: one Back leaves it without landing on /match.
    act(() => window.history.back());
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(window.location.pathname).not.toBe('/match');
    expect(window.location.pathname).not.toBe('/results');
  });

  it('after a normal end the Back guard is gone: one Back leaves /match', async () => {
    const m = await inMatch();
    start(m, 9);
    revealQ(m, 9, 5000, 4000);
    await waitFor(() => expect((window.history.state as { minnalGuard?: boolean } | null)?.minnalGuard).not.toBe(true));
    act(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('/results', () => {
  it('with no outcome it goes Home', async () => {
    renderApp('/results');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});

describe('rejoin after a reload', () => {
  /** A match she is in on the server; this tab has just reloaded, so the store is empty. */
  function aMatch() {
    const { payload } = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    const self = payload.selfParticipantId;
    const opponent = payload.participants.find((p) => p.participantId !== self)!.participantId;
    return { matchId: payload.matchId, self, opponent, participants: payload.participants };
  }

  async function rejoining(path: string, matchId: string) {
    renderApp(path);
    expect(screen.getByTestId('rejoining')).toHaveTextContent('Reconnecting…');
    expect(screen.queryByRole('button')).toBeNull();
    await waitFor(() => expect(clients).toHaveLength(1));
    act(() => socket().open());
    expect(socket().isSubscribed(matchTopic(matchId))).toBe(true);
    expect(socket().sentTo(matchResync(matchId))).toBe(1);
  }

  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it('from the stored id: "Reconnecting…", then the open question with her score, and she can answer', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    liveMatchId.save({ matchId });
    await rejoining('/match', matchId);
    await flushAnnouncements();
    expect(politeText()).toBe('Reconnecting…');
    act(() =>
      socket().deliver(
        snapshot(matchId, {
          refSeq: 7,
          questionIndex: 2,
          startedAt: Date.now(),
          scores: [{ participantId: self, score: 1640 }, { participantId: opponent, score: 900 }],
          participants,
          selfParticipantId: self,
        }),
      ),
    );
    expect(screen.queryByTestId('rejoining')).toBeNull();
    expect(screen.getByTestId('progress')).toHaveTextContent('Q 3/10');
    expect(screen.getByTestId('score-strip')).toHaveTextContent('1,640');
    fireEvent.click(screen.getByTestId('option-1'));
    expect(socket().bodiesTo(matchAnswer(matchId))).toEqual([{ questionIndex: 2, optionIndex: 1 }]);
  });

  it('from ?matchId= with nothing stored: rejoins that match', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    await rejoining(`/match?matchId=${matchId}`, matchId);
    act(() =>
      socket().deliver(
        snapshot(matchId, {
          refSeq: 1,
          phase: 'LEAD_IN',
          scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
          participants,
        }),
      ),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Get ready');
  });

  it('a slow reload (grace expired): the Forfeited notice, then the results', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    liveMatchId.save({ matchId });
    await rejoining('/match', matchId);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    act(() =>
      socket().deliver(
        snapshot(matchId, {
          refSeq: 9,
          phase: 'REVEAL',
          questionIndex: 4,
          scores: [{ participantId: self, score: 2100, forfeited: true }, { participantId: opponent, score: 1300 }],
          participants,
          youForfeited: true,
        }),
      ),
    );
    expect(screen.getByTestId('notice-forfeited')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(FORFEIT_NOTICE_MS));
    expect(window.location.pathname).toBe('/results');
    expect(screen.getByTestId('result-self')).toHaveTextContent('2,100');
  });

  it('the match is over and its result is stored: NOT_IN_MATCH opens /results', async () => {
    const { matchId } = aMatch();
    liveMatchId.save({ matchId });
    const ended = parseMatchEnded(
      matchEnded(matchId, {
        participants: [
          { participantId: 'me', displayName: 'Guest 4821', kind: 'GUEST', score: 900, correctCount: 1, placement: 1 },
          { participantId: 'bot', displayName: 'Minnal Bot', kind: 'BOT', score: 0, correctCount: 0, placement: 2 },
        ],
        breakdown: { me: [{ pickedIndex: 0, correct: true, responseMs: 2000, points: 900 }], bot: [{ correct: false, points: 0 }] },
      }).payload,
    )!;
    lastResult.save({ matchId, selfId: 'me', payload: ended, guest: true });
    await rejoining('/match', matchId);
    act(() => socket().deliver(serverError('NOT_IN_MATCH', matchId)));
    await waitFor(() => expect(window.location.pathname).toBe('/results'));
    expect(liveMatchId.load()).toBeNull();
  });

  it('a stale or foreign id with no stored result: NOT_IN_MATCH goes Home', async () => {
    const { matchId } = aMatch();
    liveMatchId.save({ matchId });
    await rejoining('/match', matchId);
    act(() => socket().deliver(serverError('NOT_IN_MATCH', matchId)));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(liveMatchId.load()).toBeNull();
  });

  it('no SNAPSHOT within 10 s: Home', async () => {
    const { matchId } = aMatch();
    liveMatchId.save({ matchId });
    // Fake timers from the start: the give-up is armed when the screen asks to rejoin.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    renderApp('/match');
    expect(screen.getByTestId('rejoining')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(clients).toHaveLength(1);
    act(() => socket().open());
    expect(socket().sentTo(matchResync(matchId))).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(9_000));
    // The resync was retried every 3 s meanwhile.
    expect(socket().sentTo(matchResync(matchId))).toBe(4);
    expect(window.location.pathname).toBe('/match');
    await act(() => vi.advanceTimersByTimeAsync(1_100));
    expect(window.location.pathname).toBe('/');
  });

  it('a settled match of another id in the store does not block the rejoin', async () => {
    const m = await inMatch();
    broadcast(m, (seq) => matchAborted(m.matchId, seq));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    const { matchId, self, opponent, participants } = aMatch();
    act(() => navigate(`/match?matchId=${matchId}`));
    expect(screen.getByTestId('rejoining')).toBeInTheDocument();
    expect(socket().sentTo(matchResync(matchId))).toBe(1);
    act(() =>
      socket().deliver(
        snapshot(matchId, {
          refSeq: 3,
          questionIndex: 1,
          startedAt: Date.now(),
          scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
          participants,
        }),
      ),
    );
    expect(screen.getByTestId('progress')).toHaveTextContent('Q 2/10');
  });

  it('leaving /match while pending cancels the rejoin: a late SNAPSHOT changes nothing', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    liveMatchId.save({ matchId });
    await rejoining('/match', matchId);
    act(() => navigate('/'));
    expect(socket().isSubscribed(matchTopic(matchId))).toBe(false);
    act(() =>
      socket().deliver(
        snapshot(matchId, {
          refSeq: 3,
          scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
          participants,
        }),
      ),
    );
    expect(window.location.pathname).toBe('/');
    expect(liveGameStore.getState()).toMatchObject({ live: null, rejoin: null, phase: 'idle' });
    expect(liveMatchId.load()).toEqual({ matchId });
  });

  it('a leftover gone does not count: after a timeout (Home), the same id again rejoins and stays on /match', async () => {
    const { matchId } = aMatch();
    liveMatchId.save({ matchId });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    renderApp('/match');
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => socket().open());
    await act(() => vi.advanceTimersByTimeAsync(10_100));
    expect(window.location.pathname).toBe('/');
    expect(liveGameStore.getState().rejoin).toEqual({ matchId, state: 'gone' });
    const sent = socket().sentTo(matchResync(matchId));
    act(() => navigate(`/match?matchId=${matchId}`));
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(window.location.pathname).toBe('/match');
    expect(screen.getByTestId('rejoining')).toHaveTextContent('Reconnecting…');
    expect(socket().sentTo(matchResync(matchId))).toBe(sent + 1);
  });

  it('under StrictMode (mount, cleanup, mount): one rejoin, one resync, "Reconnecting…" announced once', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    liveMatchId.save({ matchId });
    const before = useAnnouncements.getState().polite.seq;
    window.history.pushState(null, '', '/match');
    syncFromLocation();
    render(
      <StrictMode>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <App />
        </QueryClientProvider>
      </StrictMode>,
    );
    await flushAnnouncements();
    expect(useAnnouncements.getState().polite.seq).toBe(before + 1);
    expect(politeText()).toBe('Reconnecting…');
    await waitFor(() => expect(clients.length).toBeGreaterThan(0));
    act(() => socket().open());
    expect(socket().sentTo(matchResync(matchId))).toBe(1);
    act(() =>
      socket().deliver(
        snapshot(matchId, {
          refSeq: 3,
          questionIndex: 1,
          startedAt: Date.now(),
          scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
          participants,
        }),
      ),
    );
    expect(screen.getByTestId('progress')).toHaveTextContent('Q 2/10');
  });

  it('with no id anywhere: the "no match" view, and nothing is asked', async () => {
    renderApp('/match');
    expect(screen.getByText("There's no match on this screen.")).toBeInTheDocument();
    expect(screen.queryByTestId('rejoining')).toBeNull();
    expect(clients).toHaveLength(0);
  });
});
