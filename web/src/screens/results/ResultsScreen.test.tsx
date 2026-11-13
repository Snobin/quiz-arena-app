import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import { motion } from '../../design/tokens.ts';
import i18n from '../../i18n.ts';
import { useReduceEffectsStore } from '../../motion/reduceEffects.ts';
import { joinQuickMatch, leaveMatch, resetRealtime } from '../../realtime/connection.ts';
import { LAST_RESULT_KEY } from '../../realtime/lastResult.ts';
import { resetAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { restartGuestSession, stubFetch } from '../../test-utils/guest.ts';
import {
  matchEnded,
  matchFound,
  participantForfeited,
  questionRevealed,
  questionStarted,
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
  } = {},
) {
  const self = o.self ?? { score: 3140, placement: 1 };
  const opponent = o.opponent ?? { score: 2980, placement: 2 };
  return matchEnded(m.matchId, {
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
    questions: [{}, { options: ['Periyar', 'Bharathapuzha', 'Pamba', 'Chaliyar'], answerIndex: 0, attribution: null }, {}],
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
    expect(screen.queryByText(/rating/i)).toBeNull();
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
