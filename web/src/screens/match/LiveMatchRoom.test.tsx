import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import i18n from '../../i18n.ts';
import { resetRealtime } from '../../realtime/connection.ts';
import { liveGameStore, startRoomMatch } from '../../realtime/liveGameStore.ts';
import { matchTopic } from '../../realtime/protocol.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { restartGuestSession, stubFetch } from '../../test-utils/guest.ts';
import {
  matchAborted,
  matchEnded,
  participantForfeited,
  questionRevealed,
  questionStarted,
  scoreboard,
  useFakeRealtime,
  type FakeStomp,
} from '../../test-utils/realtime.ts';
import { countdownDigit, rankRows } from './RoomMatchParts.tsx';

vi.mock('../preload.ts', () => ({ preloadLiveMatch: vi.fn(), preloadResults: vi.fn() }));

const MATCH = '6f1c2a3e-8a4b-4c1d-9e2f-0a1b2c3d4e5f';
const ids = ['p0', 'p1', 'p2', 'p3', 'p4'];
const names = ['Rajeev', 'Anju', 'Biju', 'Chitra', 'Devan'];
const people = ids.map((participantId, i) => ({ participantId, displayName: names[i]!, kind: 'USER' as const }));
const SELF = 'p1';

let clients: FakeStomp[];
const socket = () => clients[clients.length - 1]!;

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

/** The room's match as the room client seeds it, on an open match socket; `firstQuestionAt` in ms since epoch. */
async function roomMatch(firstQuestionAt: number, clockOffsetMs = 0, custom = false) {
  startRoomMatch(
    {
      matchId: MATCH,
      mode: 'BATTLE_ROOM',
      participants: people,
      questionCount: 5,
      questionSource: custom ? 'CUSTOM' : 'BANK',
      selfParticipantId: SELF,
      topic: custom ? { name: 'Renaissance' } : { topicId: 't', name: 'Kerala History', subjectName: 'History' },
    },
    new Date(firstQuestionAt).toISOString(),
    clockOffsetMs,
  );
  await waitFor(() => expect(clients).toHaveLength(1));
  act(() => socket().open());
  expect(socket().isSubscribed(matchTopic(MATCH))).toBe(true);
}

let seq = 0;
const topic = (message: unknown) => act(() => socket().deliverTopic(MATCH, message));
function open(questionIndex: number, startedAt = Date.now()) {
  seq += 1;
  topic({ ...questionStarted(MATCH, { seq, questionIndex, startedAt }), payload: { ...questionStarted(MATCH, { seq, questionIndex, startedAt }).payload, total: 5 } });
}
function reveal(questionIndex: number, totals: number[]) {
  seq += 1;
  const message = questionRevealed(MATCH, {
    seq,
    questionIndex,
    answerIndex: 0,
    results: ids.map((participantId, i) => ({ participantId, pickedIndex: 0, correct: true, points: 100, totalScore: totals[i]! })),
  });
  topic({ ...message, payload: { ...message.payload, total: 5 } });
}

beforeEach(async () => {
  seq = 0;
  stubFetch();
  restartGuestSession();
  clients = useFakeRealtime();
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
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

describe('the countdown arithmetic', () => {
  it('counts 3-2-1 from firstQuestionAt on the server clock, holding 3 through the buffer, then nothing', () => {
    const first = new Date('2026-11-12T10:15:33.500Z').toISOString();
    const at = (msBefore: number, offset = 0) => countdownDigit(first, offset, Date.parse(first) - msBefore - offset);
    expect(at(3500)).toBe(3);
    expect(at(3000)).toBe(3);
    expect(at(2999)).toBe(3);
    expect(at(2000)).toBe(2);
    expect(at(1999)).toBe(2);
    expect(at(1000)).toBe(1);
    expect(at(1)).toBe(1);
    expect(at(0)).toBeNull();
    expect(at(-500)).toBeNull();
    // A device clock 40 s behind the server's reads the same digits once the offset is applied.
    expect(countdownDigit(first, 40_000, Date.parse(first) - 40_000 - 2_500)).toBe(3);
    expect(countdownDigit(first, 40_000, Date.parse(first) - 40_000 - 1_500)).toBe(2);
  });

  it('ranks by running total with ties sharing a rank', () => {
    const rows = rankRows(people, { p0: 300, p1: 500, p2: 500, p3: 100, p4: 0 });
    expect(rows.map((r) => [r.participantId, r.rank])).toEqual([
      ['p1', 1],
      ['p2', 1],
      ['p0', 3],
      ['p3', 4],
      ['p4', 5],
    ]);
  });
});

describe('the Battle Room live screen (Story 5.4)', () => {
  it('shows 3-2-1 timed from firstQuestionAt with the server offset, with no control, then Q1 replaces it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    const base = Date.now();
    // The device clock is 5 s behind the server's: firstQuestionAt is 3.5 s ahead on the server clock.
    await roomMatch(base + 5_000 + 3_500, 5_000);
    renderApp('/match');
    expect(await screen.findByTestId('countdown')).toHaveTextContent('3');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Get ready…');
    expect(screen.queryByRole('button', { name: /start|skip/i })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByTestId('countdown')).toHaveTextContent('2');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByTestId('countdown')).toHaveTextContent('1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.queryByTestId('countdown')).toBeNull();
    open(0);
    expect(await screen.findByTestId('progress')).toHaveTextContent('Q 1/5');
    // The lead-in standings list everyone from the start.
    expect(screen.getAllByTestId('room-row')).toHaveLength(5);
  });

  it('shows the room header and plain standings: ranks, "You", answered dots and no names beside the options', async () => {
    await roomMatch(Date.now() - 1_000);
    renderApp('/match');
    open(0);
    await screen.findByTestId('progress');
    expect(screen.getByTestId('room-header')).toHaveTextContent('You');
    expect(screen.queryByTestId('score-strip')).toBeNull();
    seq += 1;
    topic(scoreboard(MATCH, seq, 0, ['p0', 'p2']));
    const rows = screen.getAllByTestId('room-row');
    expect(rows).toHaveLength(5);
    // Dots in participant order of the ranking (all totals 0, so the match's order): p0 and p2 answered.
    expect(screen.getAllByTestId('answered-dot').map((dot) => dot.textContent)).toEqual(['●', '○', '●', '○', '○']);
    // Her own row reads "You" and the accessible name says who has answered.
    const own = rows.find((row) => row.getAttribute('aria-label')?.includes('You'))!;
    expect(own.getAttribute('aria-label')).toBe('Place 1, You, 0 points, not answered yet');
    const answered = rows.find((row) => row.getAttribute('aria-label')?.includes('Rajeev'))!;
    expect(answered.getAttribute('aria-label')).toContain('answered');
    expect(document.body.querySelector('[aria-live] [data-testid="room-standings"]')).toBeNull();
    // Nobody is announced as having answered: forty-nine of those would bury everything.
    expect(useAnnouncements.getState().polite.text).not.toContain('answered');
  });

  it('a custom-topic room reads "Battle Room · <topic>" with the own tag, and its reveal has no source line', async () => {
    await roomMatch(Date.now() - 1_000, 0, true);
    renderApp('/match');
    open(0);
    await screen.findByTestId('progress');
    const header = screen.getByTestId('room-custom-header');
    expect(header).toHaveTextContent('Battle Room · Renaissance');
    expect(within(header).getByTestId('own-tag')).toHaveTextContent('Own');
    expect(screen.getByTestId('mode-label')).toHaveTextContent('Battle Room · Renaissance');
    reveal(0, [100, 100, 100, 100, 100]);
    await screen.findByTestId('reveal-details');
    expect(screen.queryByTestId('attribution')).toBeNull();
    expect(screen.queryByTestId('report-link')).toBeNull();
  });

  it('a bank room has no custom header', async () => {
    await roomMatch(Date.now() - 1_000);
    renderApp('/match');
    open(0);
    await screen.findByTestId('progress');
    expect(screen.queryByTestId('room-custom-header')).toBeNull();
  });

  it('after a reveal the standings re-rank by total, and the opponents are not named under the options', async () => {
    await roomMatch(Date.now() - 1_000);
    renderApp('/match');
    open(0);
    await screen.findByTestId('progress');
    reveal(0, [300, 900, 500, 100, 0]);
    await waitFor(() => expect(screen.getAllByTestId('room-row')[0]).toHaveAttribute('aria-label', 'Place 1, You, 900 points, '));
    expect(screen.getAllByTestId('room-row').map((row) => row.getAttribute('aria-label')?.split(',')[1]?.trim())).toEqual(['You', 'Biju', 'Rajeev', 'Chitra', 'Devan']);
    expect(screen.queryByText('Chitra', { selector: '[data-testid="option-0"] *' })).toBeNull();
  });

  it('an abort goes Home with the "did not count" notice, announced politely', async () => {
    await roomMatch(Date.now() - 1_000);
    renderApp('/match');
    open(0);
    await screen.findByTestId('progress');
    seq += 1;
    topic(matchAborted(MATCH, seq));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(useAnnouncements.getState().polite.text).toBe("The match was called off and won't count");
  });

  it('the final reveal with MATCH_ENDED hands off to /results for a room (the podium), not the interim list', async () => {
    await roomMatch(Date.now() - 1_000);
    renderApp('/match');
    open(4);
    await screen.findByTestId('progress');
    reveal(4, [300, 900, 500, 100, 0]);
    // MATCH_ENDED is private: the topic is dropped after the last reveal.
    act(() =>
      socket().deliver({
      ...matchEnded(MATCH, {
        mode: 'BATTLE_ROOM',
        count: 5,
        participants: ids.map((participantId, i) => ({ participantId, displayName: names[i]!, kind: 'USER', score: [300, 900, 500, 100, 0][i]!, correctCount: 3, placement: [3, 1, 2, 4, 5][i]! })),
        breakdown: Object.fromEntries(ids.map((id) => [id, Array.from({ length: 5 }, () => ({ pickedIndex: 0, correct: true, points: 100 }))])),
      }),
      }),
    );
    await waitFor(() => expect(window.location.pathname).toBe('/results'), { timeout: 4_000 });
    expect(await screen.findByTestId('podium')).toBeInTheDocument();
    expect(screen.getAllByTestId('results-standings-row')).toHaveLength(5);
    expect(screen.queryByTestId('room-final')).toBeNull();
    expect(liveGameStore.getState().live?.outcome?.kind).toBe('completed');
  });

  it('a forfeiting player stays on the screen with the notice and a Home link, not the 1v1 results', async () => {
    await roomMatch(Date.now() - 1_000);
    renderApp('/match');
    open(0);
    await screen.findByTestId('progress');
    seq += 1;
    topic(participantForfeited(MATCH, seq, SELF));
    expect(await screen.findByTestId('notice-forfeited')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    await new Promise((resolve) => setTimeout(resolve, 2_400));
    expect(window.location.pathname).toBe('/match');
    // Another player leaving is a plain notice, never the 1v1 "you win" line.
    seq += 1;
    topic(participantForfeited(MATCH, seq, 'p3'));
    expect(await screen.findByTestId('notice-opponent-left')).toHaveTextContent('Chitra');
    expect(screen.getByTestId('notice-opponent-left')).not.toHaveTextContent('win');
  });
  it('her own forfeit, then MATCH_ENDED, opens /results with the podium', async () => {
    await roomMatch(Date.now() - 1_000);
    renderApp('/match');
    open(0);
    await screen.findByTestId('progress');
    seq += 1;
    topic(participantForfeited(MATCH, seq, SELF));
    expect(await screen.findByTestId('notice-forfeited')).toBeInTheDocument();
    act(() =>
      socket().deliver({
        ...matchEnded(MATCH, {
          mode: 'BATTLE_ROOM',
          count: 5,
          participants: ids.map((participantId, i) => ({ participantId, displayName: names[i]!, kind: 'USER', score: [300, 900, 500, 100, 0][i]!, correctCount: 3, placement: [3, 1, 2, 4, 5][i]!, forfeited: participantId === SELF })),
          breakdown: Object.fromEntries(ids.map((id) => [id, Array.from({ length: 5 }, () => ({ pickedIndex: 0, correct: true, points: 100 }))])),
        }),
      }),
    );
    await waitFor(() => expect(window.location.pathname).toBe('/results'));
    expect(await screen.findByTestId('podium')).toBeInTheDocument();
  });

  it('a player who confirms Leave goes Home: no 1v1 results and no frozen screen', async () => {
    await roomMatch(Date.now() - 1_000);
    renderApp('/match');
    open(0);
    await screen.findByTestId('progress');
    fireEvent.click(screen.getByTestId('leave-button'));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Leave' }));
    seq += 1;
    topic(participantForfeited(MATCH, seq, SELF));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});
