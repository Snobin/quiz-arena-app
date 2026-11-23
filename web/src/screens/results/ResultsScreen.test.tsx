import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import { PROFILE_PATH, resetProfile } from '../../profile/profileStore.ts';
import { REFRESH_PATH, session } from '../../auth/session.ts';
import { motion } from '../../design/tokens.ts';
import i18n from '../../i18n.ts';
import { useReduceEffectsStore } from '../../motion/reduceEffects.ts';
import { joinQuickMatch, leaveMatch, resetRealtime } from '../../realtime/connection.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { LAST_RESULT_KEY } from '../../realtime/lastResult.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { navigate, syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { jsonResponse, restartGuestSession, stubFetch, utf8Jwt } from '../../test-utils/guest.ts';
import {
  matchEnded,
  matchFound,
  participantForfeited,
  questionRevealed,
  questionStarted,
  MATCHMAKING_FAILED,
  rematchCancelSend,
  rematchDeclined,
  rematchExpired,
  rematchRequested,
  rematchSend,
  serverError,
  useFakeRealtime,
  type EndedAnswer,
  type FakeStomp,
} from '../../test-utils/realtime.ts';

/** Story 1.10: the results screen, from a live MATCH_ENDED or from sessionStorage after a reload. */

const flashes = vi.hoisted(() => ({ queue: [] as Array<{ run: (t: number) => void; cancelled: boolean }>, requested: 0 }));
vi.mock('../../motion/flashScheduler.ts', () => ({
  requestFlash: (run: (t: number) => void) => {
    const entry = { run, cancelled: false };
    flashes.queue.push(entry);
    flashes.requested += 1;
    return () => {
      entry.cancelled = true;
    };
  },
  resetFlashScheduler: () => {
    flashes.queue.length = 0;
  },
}));

// The share chunk is exercised in `share/shareResult.test.ts`; here only the button and its notes are under test.
const shareResultMock = vi.hoisted(() => vi.fn());
vi.mock('../../share/shareResult.ts', () => ({ shareResult: shareResultMock }));

function runFlashes(): number {
  let ran = 0;
  act(() => {
    while (flashes.queue.length) {
      const entry = flashes.queue.shift()!;
      if (!entry.cancelled) {
        entry.run(0);
        ran += 1;
      }
    }
  });
  return ran;
}

type Animated = { keyframes: Keyframe[]; options: KeyframeAnimationOptions; element: Element };
let animations: Animated[];
let clients: FakeStomp[];
const socket = () => clients[clients.length - 1]!;
const heading = () => screen.getByRole('heading', { level: 1 });
const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });

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

type Match = { matchId: string; self: string; opponent: string };

async function found(opponent: { name: string; kind: 'BOT' | 'GUEST' } = { name: 'Vishnu R', kind: 'GUEST' }): Promise<Match> {
  joinQuickMatch();
  await waitFor(() => expect(clients).toHaveLength(1));
  act(() => socket().open());
  const message = matchFound(opponent);
  act(() => socket().deliver(message));
  const { matchId, selfParticipantId, participants } = message.payload;
  return { matchId, self: selfParticipantId, opponent: participants.find((p) => p.participantId !== selfParticipantId)!.participantId };
}

/** Q1 right in 4.2 s (+800), Q2 wrong (picked option 2), Q3 not answered. */
const TOPIC = '11111111-1111-4111-8111-111111111111';
const MINE: EndedAnswer[] = [
  { pickedIndex: 0, correct: true, responseMs: 4200, points: 800 },
  { pickedIndex: 2, correct: false, responseMs: 6000, points: 0 },
  { correct: false, points: 0 },
];
const THEIRS: EndedAnswer[] = [
  { pickedIndex: 1, correct: false, responseMs: 3000, points: 0 },
  { pickedIndex: 0, correct: true, responseMs: 2000, points: 900 },
  { pickedIndex: 0, correct: true, responseMs: 2500, points: 850 },
];

function ended(
  m: Match,
  o: {
    self?: { score: number; placement: number; forfeited?: boolean };
    opponent?: { score: number; placement: number; forfeited?: boolean; name?: string; kind?: string };
    mode?: 'QUICK' | 'TOPIC_DUEL' | 'BATTLE_ROOM';
    questionSource?: 'BANK' | 'CUSTOM';
  } = {},
) {
  const self = o.self ?? { score: 3140, placement: 1 };
  const opponent = o.opponent ?? { score: 2980, placement: 2 };
  return matchEnded(m.matchId, {
    ...(o.mode ? { mode: o.mode } : {}),
    ...(o.questionSource ? { questionSource: o.questionSource } : {}),
    participants: [
      { participantId: m.self, displayName: 'Guest 4821', kind: 'GUEST', correctCount: 1, ...self },
      {
        participantId: m.opponent,
        displayName: opponent.name ?? 'Vishnu R',
        kind: opponent.kind ?? 'GUEST',
        correctCount: 2,
        score: opponent.score,
        placement: opponent.placement,
        forfeited: opponent.forfeited ?? false,
      },
    ],
    breakdown: { [m.self]: MINE, [m.opponent]: THEIRS },
    questions: [
      { topicId: TOPIC },
      { options: ['Periyar', 'Bharathapuzha', 'Pamba', 'Chaliyar'], answerIndex: 0, attribution: null, topicId: TOPIC },
      { topicId: TOPIC },
    ],
  });
}

/** A live match whose last question was revealed and whose MATCH_ENDED came in, then /results. */
async function liveResults(o: Parameters<typeof ended>[1] = {}, opponent?: { name: string; kind: 'BOT' | 'GUEST' }) {
  const m = await found(opponent);
  act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: 1, questionIndex: 9, startedAt: Date.now() })));
  act(() =>
    socket().deliverTopic(
      m.matchId,
      questionRevealed(m.matchId, {
        seq: 2,
        questionIndex: 9,
        answerIndex: 0,
        results: [
          { participantId: m.self, pickedIndex: 0, correct: true, points: 800, totalScore: o.self?.score ?? 3140 },
          { participantId: m.opponent, pickedIndex: 1, correct: false, points: 0, totalScore: o.opponent?.score ?? 2980 },
        ],
      }),
    ),
  );
  act(() => socket().deliver(ended(m, o)));
  renderApp('/results');
  return m;
}

beforeEach(async () => {
  stubFetch();
  restartGuestSession();
  clients = useFakeRealtime();
  window.sessionStorage.clear();
  flashes.queue.length = 0;
  flashes.requested = 0;
  animations = [];
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    animations.push({ keyframes, options, element: this });
    return {} as Animation;
  } as unknown as Element['animate'];
  await act(() => i18n.changeLanguage('en'));
});

afterEach(async () => {
  vi.useRealTimers();
  resetRealtime();
  session.reset();
  resetProfile();
  guestSession.reset();
  clearReturnFocus();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  window.sessionStorage.clear();
  useReduceEffectsStore.setState({ setting: 'follow-phone', osReduced: false, fallback: null });
  delete (Element.prototype as { animate?: unknown }).animate;
  await act(() => i18n.changeLanguage('ml'));
});

describe('the guest prompt on a live arrival (Story 2.4)', () => {
  it('a guest sees the prompt right after her match, with that match as its hook', async () => {
    await liveResults({ self: { score: 2980, placement: 2 }, opponent: { score: 3140, placement: 1 } });
    expect(await screen.findByTestId('results-sign-in-prompt')).toHaveTextContent(
      'Vishnu R won this one. You scored 2,980. Sign in and your next match can move your Quick Match rating.',
    );
    expect(lastResult.load()?.guest).toBe(true);
  });

  it('a Battle Room result gets no Quick Match prompt', async () => {
    await liveResults({ mode: 'BATTLE_ROOM' });
    expect(screen.queryByTestId('results-sign-in-prompt')).toBeNull();
  });

  it('a registered player’s own match never shows it, even if her session later drops to guest', async () => {
    // A registered session whose refresh works, so joining a match keeps her registered.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === REFRESH_PATH
          ? jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() })
          : String(input) === PROFILE_PATH
            ? jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true })
            : jsonResponse({ status: 404 }, 404, 'application/problem+json'),
      ),
    );
    session.start();
    await session.ready();
    expect(session.store.getState().status).toBe('registered');
    await liveResults();
    // The profile loads first (a registered player's screens wait for it), then the results show.
    expect(await screen.findByTestId('rematch-button')).toBeInTheDocument();
    expect(screen.queryByTestId('results-sign-in-prompt')).toBeNull();
    expect(lastResult.load()?.guest).toBe(false);
    act(() => session.store.setState({ status: 'guest', name: null, signedOut: true }));
    expect(screen.queryByTestId('results-sign-in-prompt')).toBeNull();
    expect(screen.queryByTestId('guest-match-note')).toBeNull();
  });
});

describe('Practise this topic on the results (Story 4.4)', () => {
  const PRACTISE = /Practise this topic/;
  // Losing skips the win takeover, which would otherwise cover the rows.
  const LOSS = { self: { score: 2980, placement: 2 }, opponent: { score: 3140, placement: 1 } };

  async function registered() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === REFRESH_PATH
          ? jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + 3600_000).toISOString() })
          : String(input) === PROFILE_PATH
            ? jsonResponse({ displayName: 'Anju', district: 'thrissur', examLevel: 'DEGREE', language: 'en', profileComplete: true })
            : jsonResponse({ status: 404 }, 404, 'application/problem+json'),
      ),
    );
    session.start();
    await session.ready();
  }

  it('a registered player on a bank match sees it on an expanded row, named by its question number', async () => {
    await registered();
    await liveResults(LOSS);
    expect(await screen.findByRole('button', { name: 'Practise this topic, question 2' })).toBeInTheDocument();
    // The correct row is collapsed: no link until it is expanded.
    expect(screen.queryByRole('button', { name: 'Practise this topic, question 1' })).toBeNull();
  });

  it('a guest never sees it', async () => {
    await liveResults(LOSS);
    await screen.findByTestId('rematch-button');
    expect(screen.queryByRole('button', { name: PRACTISE })).toBeNull();
  });

  it('a custom-source match never shows it, even for a registered player', async () => {
    await registered();
    await liveResults({ ...LOSS, questionSource: 'CUSTOM' });
    expect(await screen.findByTestId('rematch-button')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: PRACTISE })).toBeNull();
  });
});

describe('the win takeover', () => {
  it('a live win: a dialog labelled by its title with Continue focused; the flood goes through the flash scheduler', async () => {
    await liveResults();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('You won!');
    // Not focused while still invisible.
    expect(within(dialog).getByRole('button', { name: 'Continue' })).not.toHaveFocus();
    expect(screen.getByTestId('takeover-self-score')).toHaveTextContent('3,140');
    expect(screen.getByTestId('takeover-opponent')).toHaveTextContent('Vishnu R 2,980');
    expect(screen.getByTestId('takeover-bolt')).toBeInTheDocument();
    // Hidden until the scheduler lets the flood start; the results below are inert meanwhile.
    expect(dialog.style.opacity).toBe('0');
    expect(screen.getByTestId('results-surface')).toHaveAttribute('inert');
    expect(flashes.requested).toBe(1);
    expect(runFlashes()).toBe(1);
    expect(dialog.style.opacity).toBe('1');
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toHaveFocus();
    const flood = animations.find((a) => a.element === dialog)!;
    expect(flood.options.duration).toBe(motion.winFlood);
    expect(flood.keyframes).toEqual([{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }]);
  });

  it('holds for winHold after the flood, collapses over winCollapse, then focuses the heading; taps are ignored for 400 ms', async () => {
    await liveResults();
    fakeTimers();
    runFlashes();
    await act(() => vi.advanceTimersByTimeAsync(motion.winFlood + motion.winHold - 10));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(20));
    const collapse = animations[animations.length - 1]!;
    expect(collapse.options.duration).toBe(motion.winCollapse);
    expect(collapse.keyframes[collapse.keyframes.length - 1]).toEqual({ opacity: 0 });
    await act(() => vi.advanceTimersByTimeAsync(motion.winCollapse));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(heading()).toHaveFocus();
    expect(heading()).toHaveAccessibleName('You won, 3,140 to 2,980');
    expect(screen.getByTestId('results-surface')).not.toHaveAttribute('inert');
    // The first 400 ms: a tap on Home does nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(window.location.pathname).toBe('/results');
    await act(() => vi.advanceTimersByTimeAsync(motion.resultsTapGuard));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(window.location.pathname).toBe('/');
  });

  it('a tap anywhere dismisses it early, and the tap goes no further', async () => {
    await liveResults();
    fakeTimers();
    runFlashes();
    const outside = vi.fn();
    document.body.addEventListener('click', outside);
    fireEvent.click(screen.getByTestId('takeover-self-score'));
    document.body.removeEventListener('click', outside);
    expect(outside).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(motion.winCollapse));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('results-band')).toHaveAttribute('data-result', 'win');
  });

  it('reduced effects: a 200 ms fade and no auto-advance; Continue only', async () => {
    useReduceEffectsStore.setState({ setting: 'on' });
    await liveResults();
    fakeTimers();
    runFlashes();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Continue' })).toHaveFocus();
    const fade = animations.find((a) => a.element === dialog)!;
    expect(fade.options.duration).toBe(motion.reducedFade);
    expect(fade.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animations.some((a) => a.keyframes.some((k) => 'transform' in k))).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await act(() => vi.advanceTimersByTimeAsync(motion.reducedFade));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(heading()).toHaveFocus();
  });

  it('reduced effects: Esc dismisses it after the fade and focuses the heading', async () => {
    useReduceEffectsStore.setState({ setting: 'on' });
    await liveResults();
    fakeTimers();
    runFlashes();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await act(() => vi.advanceTimersByTimeAsync(motion.reducedFade - 10));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(heading()).toHaveFocus();
  });

  it('never replays: Back to /match and forward to /results shows the settled screen', async () => {
    const m = await liveResults();
    fakeTimers();
    runFlashes();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await act(() => vi.advanceTimersByTimeAsync(motion.winCollapse));
    act(() => {
      window.history.pushState(null, '', `/match?matchId=${m.matchId}`);
      syncFromLocation();
    });
    act(() => {
      window.history.pushState(null, '', '/results');
      syncFromLocation();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('results-band')).toBeInTheDocument();
  });

  it('a forfeited winner gets no takeover', async () => {
    await liveResults({ self: { score: 3140, placement: 1, forfeited: true } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('results-band')).toHaveAttribute('data-result', 'win');
    expect(screen.getByTestId('notice-forfeited')).toBeInTheDocument();
  });

  it('a 1v1 forfeiter is told the opponent wins', async () => {
    await liveResults({ self: { score: 3140, placement: 2, forfeited: true }, opponent: { score: 2980, placement: 1 } });
    expect(screen.getByTestId('notice-forfeited')).toHaveTextContent('You left · Vishnu R wins');
  });

  it('a Battle Room forfeiter keeps the "match goes on" notice', async () => {
    await liveResults({ mode: 'BATTLE_ROOM', self: { score: 3140, placement: 1, forfeited: true } });
    expect(screen.getByTestId('notice-forfeited')).toHaveTextContent('the match goes on');
  });
});

describe('loss and draw', () => {
  it('a loss opens settled: the ink band with no volt and the loss line naming the winner unchanged', async () => {
    await liveResults({ self: { score: 2980, placement: 2 }, opponent: { score: 3140, placement: 1 } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(flashes.requested).toBe(0);
    const band = screen.getByTestId('results-band');
    expect(band).toHaveAttribute('data-result', 'loss');
    expect(band.className).not.toMatch(/volt/);
    expect(band.querySelector('[data-accent]')).toBeNull();
    expect(screen.getByTestId('results-line')).toHaveTextContent("Vishnu R won · Next time's yours");
    expect(heading()).toHaveFocus();
    expect(heading()).toHaveAccessibleName('You lost, 2,980 to 3,140');
  });

  it('a shared first place is a draw: both scores in white, no volt, no bolt, no takeover', async () => {
    await liveResults({ self: { score: 3000, placement: 1 }, opponent: { score: 3000, placement: 1 } });
    expect(screen.queryByRole('dialog')).toBeNull();
    const band = screen.getByTestId('results-band');
    expect(band).toHaveAttribute('data-result', 'draw');
    expect(screen.getByTestId('results-line')).toHaveTextContent('Draw');
    expect(band.querySelector('[data-accent]')).toBeNull();
    expect(screen.getByTestId('results-self-score').className).toContain('text-on-band');
    expect(screen.getByTestId('results-rival').className).toContain('text-on-band');
    expect(heading()).toHaveAccessibleName('Draw, 3,000 to 3,000');
  });

  it('a bot opponent always shows the BOT badge; a forfeited opponent shows "left"; no rating delta anywhere', async () => {
    await liveResults(
      { self: { score: 2000, placement: 2 }, opponent: { score: 2500, placement: 1, forfeited: true, name: 'Minnal Bot', kind: 'BOT' } },
      { name: 'Minnal Bot', kind: 'BOT' },
    );
    const rival = screen.getByTestId('results-rival');
    expect(within(rival).getByTestId('bot-badge')).toBeInTheDocument();
    expect(within(rival).getByTestId('rival-left')).toHaveTextContent('left');
    // No rating-delta area anywhere (the guest prompt may mention a rating; it is not a delta).
    expect(screen.queryAllByText(/rating/i).filter((el) => !el.closest('[data-testid="results-sign-in-prompt"]'))).toEqual([]);
    expect(screen.queryByText(/updating/i)).toBeNull();
  });
});

describe('the breakdown', () => {
  it('the dot strip is a list with spoken labels and aria-hidden glyphs', async () => {
    await liveResults({ self: { score: 800, placement: 2 }, opponent: { score: 1750, placement: 1 } });
    const strip = screen.getByRole('list', { name: 'Question by question' });
    const items = within(strip).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Q1 correct', 'Q2 wrong', 'Q3 not answered']);
    expect(items.map((li) => li.dataset.state)).toEqual(['correct', 'wrong', 'missed']);
    for (const li of items) expect(li.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('a correct row loads collapsed as a button "Q1 ✓ 4.2 s +800" and expands on tap', async () => {
    await liveResults({ self: { score: 800, placement: 2 }, opponent: { score: 1750, placement: 1 } });
    const rows = screen.getAllByTestId('breakdown-row');
    const correct = rows[0]!;
    const toggle = within(correct).getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('Q1 ✓');
    expect(toggle).toHaveTextContent('4.2 s');
    expect(toggle).toHaveTextContent('+800');
    expect(toggle).toHaveAccessibleName(/Q1 correct/);
    expect(within(correct).queryByTestId('row-details')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(correct).getByTestId('row-details')).toHaveTextContent('Question 1');
    expect(within(correct).getByTestId('attribution')).toHaveTextContent('Kerala PSC LDC 2010');
  });

  it('wrong and missed rows are always expanded: You (brick), Answer (bold), the explanation and the source', async () => {
    await liveResults({ self: { score: 800, placement: 2 }, opponent: { score: 1750, placement: 1 } });
    const [, wrong, missed] = screen.getAllByTestId('breakdown-row');
    expect(within(wrong!).queryByRole('button')).toBeNull();
    const yours = within(wrong!).getByTestId('row-yours');
    expect(yours).toHaveTextContent('You: Pamba');
    expect(yours.querySelector('.text-brick')).toHaveTextContent('Pamba');
    const answer = within(wrong!).getByTestId('row-answer');
    expect(answer).toHaveTextContent('Answer: Periyar');
    expect(answer.querySelector('.font-bold')).toHaveTextContent('Periyar');
    expect(within(wrong!).getByTestId('reveal-details')).toHaveTextContent('വിശദീകരണം 2');
    expect(within(wrong!).getByTestId('attribution')).toHaveTextContent('source not available');
    expect(within(wrong!).getByTestId('row-points')).toHaveTextContent('0');
    expect(within(wrong!).getByTestId('row-points').className).toContain('text-brick');
    expect(within(wrong!).getByTestId('row-time')).toHaveTextContent('6.0 s');
    expect(within(missed!).getByTestId('row-yours')).toHaveTextContent('You: not answered');
    expect(within(missed!).queryByTestId('row-time')).toBeNull();
  });
});

describe('reload, title and fallbacks', () => {
  it('a reload rehydrates the same settled screen from sessionStorage, with no takeover', async () => {
    await liveResults();
    expect(window.sessionStorage.getItem(LAST_RESULT_KEY)).not.toBeNull();
    // A reload: the store is gone, the session storage stays.
    const saved = window.sessionStorage.getItem(LAST_RESULT_KEY)!;
    cleanup();
    resetRealtime();
    window.sessionStorage.setItem(LAST_RESULT_KEY, saved);
    renderApp('/results');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('results-band')).toHaveAttribute('data-result', 'win');
    expect(screen.getAllByTestId('breakdown-row')).toHaveLength(3);
    expect(heading()).toHaveFocus();
    expect(heading()).toHaveAccessibleName('You won, 3,140 to 2,980');
    expect(document.title).toContain('Results');
  });

  it('a corrupt stored entry goes Home', async () => {
    window.sessionStorage.setItem(LAST_RESULT_KEY, '{"matchId":"x"');
    renderApp('/results');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('with nothing stored or held it goes Home', async () => {
    renderApp('/results');
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('after Leave the minimal view says the match is still going, then upgrades in place on MATCH_ENDED', async () => {
    const m = await found();
    act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: 1, questionIndex: 2, startedAt: Date.now() })));
    act(() => void leaveMatch());
    act(() => socket().deliverTopic(m.matchId, participantForfeited(m.matchId, 2, m.self, 2)));
    renderApp('/results');
    expect(screen.getByTestId('results-pending')).toHaveTextContent('The match is still going');
    expect(screen.getByTestId('result-self')).toBeInTheDocument();
    act(() => socket().deliver(ended(m, { self: { score: 800, placement: 2, forfeited: true }, opponent: { score: 1750, placement: 1 } })));
    expect(screen.queryByTestId('results-pending')).toBeNull();
    expect(screen.getByTestId('results-band')).toHaveAttribute('data-result', 'loss');
    expect(screen.getAllByTestId('breakdown-row')).toHaveLength(3);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('rematch (Story 1.10 part 2)', () => {
  const LOSS = { self: { score: 2980, placement: 2 }, opponent: { score: 3140, placement: 1 } };
  const polite = () => useAnnouncements.getState().polite.text;
  /** A REMATCH_REQUESTED stamped now, lapsing in 60 s. */
  const requested = (m: Match, by: string) => {
    const now = Date.now();
    return rematchRequested(m.matchId, by, new Date(now + 60_000).toISOString(), new Date(now).toISOString());
  };

  it('the bar has Rematch (primary) and Home (secondary); the minimal view keeps Home only', async () => {
    await liveResults(LOSS);
    const bar = screen.getByTestId('results-actions');
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Rematch', 'Home', 'Share']);
    expect(within(bar).getByRole('button', { name: 'Home' }).className).toContain('border-ink');
    cleanup();
    resetRealtime();
    clients = useFakeRealtime();
    const m = await found();
    act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: 1, questionIndex: 2, startedAt: Date.now() })));
    act(() => void leaveMatch());
    act(() => socket().deliverTopic(m.matchId, participantForfeited(m.matchId, 2, m.self, 2)));
    renderApp('/results');
    expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
  });

  it('Rematch sends it; her pending request shows the waiting card with a countdown; Cancel withdraws it', async () => {
    const m = await liveResults(LOSS);
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    expect(socket().sentTo(rematchSend(m.matchId))).toBe(1);
    expect(screen.getByTestId('rematch-button')).toHaveAttribute('aria-busy', 'true');
    // A second tap while it is on its way sends nothing more.
    fireEvent.click(screen.getByTestId('rematch-button'));
    expect(socket().sentTo(rematchSend(m.matchId))).toBe(1);

    act(() => socket().deliver(requested(m, m.self)));
    const card = screen.getByTestId('rematch-waiting');
    expect(card).toHaveTextContent('Waiting for Vishnu R…');
    expect(screen.getByTestId('rematch-seconds')).toHaveTextContent(/^(60|59) s left$/);
    expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull();

    fireEvent.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(socket().sentTo(rematchCancelSend(m.matchId))).toBe(1);
    expect(screen.queryByTestId('rematch-waiting')).toBeNull();
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeInTheDocument();
    expect(screen.queryByTestId('rematch-note')).toBeNull();
  });

  it('when the opponent asks first the button reads "Accept rematch", and accepting sends a rematch', async () => {
    const m = await liveResults(LOSS);
    act(() => socket().deliver(requested(m, m.opponent)));
    expect(screen.getByRole('button', { name: 'Accept rematch' })).toBeInTheDocument();
    await waitFor(() => expect(polite()).toBe('Accept rematch'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept rematch' }));
    expect(socket().sentTo(rematchSend(m.matchId))).toBe(1);
  });

  it.each([
    ['expired', (m: Match) => rematchExpired(m.matchId), 'The rematch request ran out of time'],
    ['cancelled', (m: Match) => rematchDeclined(m.matchId, 'CANCELLED'), 'Vishnu R cancelled the rematch'],
    ['unavailable', (m: Match) => rematchDeclined(m.matchId, 'UNAVAILABLE'), "A rematch isn't possible right now"],
    ['failed', () => MATCHMAKING_FAILED, "Couldn't start the rematch. Try again."],
    ['draining', () => serverError('SERVER_DRAINING'), 'Minnal is updating. Try again in a moment.'],
  ])('%s: a one-line note, announced politely once; Rematch can be sent again', async (_, message, text) => {
    const m = await liveResults(LOSS);
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    act(() => socket().deliver(requested(m, m.self)));
    act(() => socket().deliver(message(m)));
    expect(screen.getByTestId('rematch-note')).toHaveTextContent(text);
    await waitFor(() => expect(polite()).toBe(text));
    const seq = useAnnouncements.getState().polite.seq;
    // A re-render (a new clock offset from a message about another match) does not repeat it.
    act(() => socket().deliver(rematchExpired('another-match')));
    await act(async () => {});
    expect(useAnnouncements.getState().polite.seq).toBe(seq);
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    expect(socket().sentTo(rematchSend(m.matchId))).toBe(2);
    expect(screen.queryByTestId('rematch-note')).toBeNull();
  });

  it('on the new MATCH_FOUND it opens /match at once', async () => {
    await liveResults(LOSS, { name: 'Minnal Bot', kind: 'BOT' });
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    act(() => socket().deliver(matchFound({ name: 'Minnal Bot', kind: 'BOT' })));
    await waitFor(() => expect(window.location.pathname).toBe('/match'));
  });

  it('Home while waiting sends a cancel and goes Home', async () => {
    const m = await liveResults(LOSS);
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    act(() => socket().deliver(requested(m, m.self)));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(socket().sentTo(rematchCancelSend(m.matchId))).toBe(1);
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });

  it('leaving /results another way while waiting sends one cancel', async () => {
    const m = await liveResults(LOSS);
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    act(() => socket().deliver(requested(m, m.self)));
    act(() => navigate('/'));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(socket().sentTo(rematchCancelSend(m.matchId))).toBe(1);
  });

  it('the countdown runs on the server clock: a server 30 s ahead still shows about 60 s left', async () => {
    const m = await liveResults(LOSS);
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    const serverNow = Date.now() + 30_000;
    act(() =>
      socket().deliver(
        rematchRequested(m.matchId, m.self, new Date(serverNow + 60_000).toISOString(), new Date(serverNow).toISOString()),
      ),
    );
    expect(screen.getByTestId('rematch-seconds')).toHaveTextContent(/^(60|59) s left$/);
  });

  it('after a reload Rematch still works from the stored result', async () => {
    const m = await liveResults(LOSS);
    const saved = window.sessionStorage.getItem(LAST_RESULT_KEY)!;
    cleanup();
    resetRealtime();
    clients = useFakeRealtime();
    window.sessionStorage.setItem(LAST_RESULT_KEY, saved);
    renderApp('/results');
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    await waitFor(() => expect(clients).toHaveLength(1));
    act(() => socket().open());
    expect(socket().sentTo(rematchSend(m.matchId))).toBe(1);
    act(() => socket().deliver(requested(m, m.self)));
    expect(screen.getByTestId('rematch-waiting')).toBeInTheDocument();
  });
});

describe('Topic Duel results (Story 4.2)', () => {
  const TOPIC = { topicId: '7c1f0c9a-1111-4a2b-8c3d-0e1f2a3b4c5d', name: 'Kerala History', subjectName: 'History' };

  async function topicDuelResults() {
    joinQuickMatch(TOPIC.topicId);
    await waitFor(() => expect(clients).toHaveLength(1));
    act(() => socket().open());
    const message = matchFound({ name: 'Vishnu R', kind: 'GUEST' });
    act(() => socket().deliver({ ...message, payload: { ...message.payload, mode: 'TOPIC_DUEL', topic: TOPIC } }));
    const { matchId, selfParticipantId, participants } = message.payload;
    const m: Match = {
      matchId,
      self: selfParticipantId,
      opponent: participants.find((p) => p.participantId !== selfParticipantId)!.participantId,
    };
    act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: 1, questionIndex: 9, startedAt: Date.now() })));
    act(() =>
      socket().deliverTopic(
        m.matchId,
        questionRevealed(m.matchId, {
          seq: 2,
          questionIndex: 9,
          answerIndex: 0,
          results: [
            { participantId: m.self, pickedIndex: 0, correct: true, points: 800, totalScore: 2980 },
            { participantId: m.opponent, pickedIndex: 1, correct: false, points: 0, totalScore: 3140 },
          ],
        }),
      ),
    );
    // A loss: a win opens the takeover, which hides the results from the accessibility tree for a moment.
    const result = ended(m, { mode: 'TOPIC_DUEL', self: { score: 2980, placement: 2 }, opponent: { score: 3140, placement: 1 } });
    act(() => socket().deliver({ ...result, payload: { ...result.payload, topic: TOPIC } }));
    renderApp('/results');
    return m;
  }

  it('names the topic under the result line and in the heading\'s accessible name', async () => {
    await topicDuelResults();
    expect(screen.getByTestId('results-topic')).toHaveTextContent('Topic Duel · Kerala History');
    expect(heading()).toHaveAccessibleName('You lost, 2,980 to 3,140, Topic Duel · Kerala History');
    expect(screen.getByTestId('results-line')).toBeInTheDocument();
  });

  it('survives a reload: the stored result keeps the topic', async () => {
    await topicDuelResults();
    cleanup();
    resetRealtime();
    clients = useFakeRealtime();
    renderApp('/results');
    expect(await screen.findByTestId('results-topic')).toHaveTextContent('Topic Duel · Kerala History');
  });

  it('a Quick Match names no topic', async () => {
    await liveResults();
    expect(screen.queryByTestId('results-topic')).toBeNull();
  });

  it('a rematch refused because the topic is too small shows the one-line note with a link to the picker', async () => {
    const m = await topicDuelResults();
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }));
    expect(socket().sentTo(rematchSend(m.matchId))).toBe(1);
    act(() => socket().deliver({ ...MATCHMAKING_FAILED, payload: { reason: 'TOPIC_UNAVAILABLE' } }));
    const note = await screen.findByTestId('rematch-note');
    expect(note).toHaveTextContent('Rematch unavailable · topic too small now');
    expect(within(note).getByRole('link', { name: 'Choose a topic' })).toHaveAttribute('href', '/play/topics?for=duel');
  });
});

describe('Share (Story 7.1)', () => {
  const LOSS = { self: { score: 2980, placement: 2 }, opponent: { score: 3140, placement: 1 } };

  beforeEach(() => {
    shareResultMock.mockReset();
  });

  it('sits last in a 1v1 bar after Rematch and Home, and shares this match', async () => {
    shareResultMock.mockResolvedValue({ outcome: 'shared' });
    const m = await liveResults(LOSS);
    const bar = await screen.findByTestId('results-actions');
    const labels = within(bar).getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual(['Rematch', 'Home', 'Share']);
    fireEvent.click(within(bar).getByTestId('share-button'));
    await waitFor(() => expect(shareResultMock).toHaveBeenCalledTimes(1));
    const [payload, selfId] = shareResultMock.mock.calls[0]!;
    expect(payload.matchId).toBe(m.matchId);
    expect(selfId).toBe(m.self);
    expect(screen.queryByTestId('share-note')).toBeNull();
  });

  it('reads "…" while the card renders and ignores taps, then says the image was saved, announced once', async () => {
    let finish!: (value: unknown) => void;
    shareResultMock.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await liveResults(LOSS);
    fireEvent.click(await screen.findByTestId('share-button'));
    await waitFor(() => expect(screen.getByTestId('share-button')).toHaveTextContent('…'));
    fireEvent.click(screen.getByTestId('share-button'));
    expect(shareResultMock).toHaveBeenCalledTimes(1);
    await act(async () => finish({ outcome: 'saved' }));
    expect(await screen.findByTestId('share-note')).toHaveTextContent('Image saved · link copied');
    expect(screen.getByTestId('share-button')).toHaveTextContent('Share');
    expect(useAnnouncements.getState().polite.text.trim()).toBe('Image saved · link copied');
  });

  it('shows the link as selectable text when the clipboard was refused', async () => {
    shareResultMock.mockResolvedValue({ outcome: 'savedLink', url: 'https://minnal.example/q' });
    await liveResults(LOSS);
    fireEvent.click(await screen.findByTestId('share-button'));
    expect(await screen.findByTestId('share-note')).toHaveTextContent('Image saved · link: https://minnal.example/q');
  });

  it('a cancelled share sheet shows nothing, and a failure says so', async () => {
    shareResultMock.mockResolvedValueOnce({ outcome: 'cancelled' });
    await liveResults(LOSS);
    fireEvent.click(await screen.findByTestId('share-button'));
    await waitFor(() => expect(shareResultMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('share-button')).toHaveTextContent('Share'));
    expect(screen.queryByTestId('share-note')).toBeNull();
    shareResultMock.mockRejectedValueOnce(new Error('chunk'));
    fireEvent.click(screen.getByTestId('share-button'));
    expect(await screen.findByTestId('share-note')).toHaveTextContent("Couldn't share. Try again.");
  });

  it('is aria-disabled with the offline caption while offline, and sends nothing', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await liveResults(LOSS);
    const button = await screen.findByTestId('share-button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Sharing needs a connection')).toBeInTheDocument();
    fireEvent.click(button);
    expect(shareResultMock).not.toHaveBeenCalled();
  });

  it('is in the Battle Room player bar after Home, and a guest who signed in after her match still has it', async () => {
    await liveResults({ mode: 'BATTLE_ROOM' });
    const bar = await screen.findByTestId('results-actions');
    expect(within(bar).getAllByRole('button').map((b) => b.textContent)).toEqual(['Home', 'Share']);
  });

  it('the minimal view, with no MATCH_ENDED yet, has no Share', async () => {
    const m = await found();
    act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: 1, questionIndex: 2, startedAt: Date.now() })));
    act(() => void leaveMatch());
    act(() => socket().deliverTopic(m.matchId, participantForfeited(m.matchId, 2, m.self, 2)));
    renderApp('/results');
    expect(screen.getByTestId('results-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('share-button')).toBeNull();
  });
});
