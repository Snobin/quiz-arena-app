import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import i18n from '../../i18n.ts';
import { joinQuickMatch, resetRealtime } from '../../realtime/connection.ts';
import { matchLeave, matchResync } from '../../realtime/protocol.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { restartGuestSession, stubFetch } from '../../test-utils/guest.ts';
import {
  matchAborted,
  matchFound,
  participantForfeited,
  questionRevealed,
  questionStarted,
  serverError,
  snapshot,
  useFakeRealtime,
  type FakeStomp,
} from '../../test-utils/realtime.ts';
import { FORFEIT_NOTICE_MS } from './LiveMatchScreen.tsx';

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
    expect(screen.getByTestId('notice-forfeited')).toHaveTextContent('You missed the remaining questions; the match goes on');
    expect(screen.queryByTestId('reconnect-banner')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(FORFEIT_NOTICE_MS));
    expect(window.location.pathname).toBe('/results');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Results');
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
    expect(within(dialog).getByRole('button', { name: 'Stay' })).toHaveFocus();
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
  it('an opponent who left: the strip says "left", a one-line notice, announced once; play goes on', async () => {
    const m = await inMatch();
    start(m, 0);
    broadcast(m, (seq) => participantForfeited(m.matchId, seq, m.opponent, 0));
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('left');
    expect(screen.getByTestId('notice-opponent-left')).toHaveTextContent('Vishnu R left the match');
    await flushAnnouncements();
    expect(politeText()).toContain('Vishnu R left the match');
    const seq = useAnnouncements.getState().polite.seq;
    start(m, 1);
    await flushAnnouncements();
    expect(useAnnouncements.getState().polite.seq).toBe(seq);
    expect(screen.getByTestId('leave-button')).toBeInTheDocument();
    expect(content()).not.toHaveAttribute('inert');
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
  it('a match that ended while she was away (NOT_IN_MATCH after Q1) shows "Match over" with Home, not a stuck screen', async () => {
    const m = await inMatch();
    start(m, 0);
    revealQ(m, 0, 900, 300);
    start(m, 1);
    act(() => socket().drop());
    await waitFor(() => expect(clients).toHaveLength(2), { timeout: 2000 });
    act(() => socket().open());
    act(() => socket().deliver(serverError('NOT_IN_MATCH', m.matchId)));
    expect(screen.queryByTestId('reconnect-banner')).toBeNull();
    expect(content()).not.toHaveAttribute('inert');
    expect(screen.getByTestId('match-over')).toHaveTextContent('900');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.queryByTestId('leave-button')).toBeNull();
    expect(window.location.pathname).toBe('/match');
    // The Back guard entry is dropped once play ends here.
    await waitFor(() => expect((window.history.state as { minnalGuard?: boolean } | null)?.minnalGuard).not.toBe(true));
    expect(window.location.pathname).toBe('/match');
  });

  it('after a normal end the Back guard is gone: one Back leaves /match', async () => {
    const m = await inMatch();
    start(m, 9);
    revealQ(m, 9, 5000, 4000);
    expect(screen.getByTestId('match-over')).toBeInTheDocument();
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
