import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.tsx';
import { guestSession } from '../../auth/guestSession.ts';
import i18n from '../../i18n.ts';
import { useReduceEffectsStore } from '../../motion/reduceEffects.ts';
import { joinQuickMatch, resetRealtime } from '../../realtime/connection.ts';
import { liveGameStore } from '../../realtime/liveGameStore.ts';
import { MATCH_ENDED_WAIT_MS, RESULTS_HOLD_MS } from './LiveMatchScreen.tsx';
import { matchAnswer, matchTopic } from '../../realtime/protocol.ts';
import { resetAnnouncements, useAnnouncements } from '../../shell/announce.ts';
import { clearReturnFocus } from '../../shell/returnFocus.ts';
import { navigate, syncFromLocation } from '../../shell/router.ts';
import { clearScrollMemory } from '../../shell/scrollMemory.ts';
import { restartGuestSession, stubFetch } from '../../test-utils/guest.ts';
import {
  answerAccepted,
  answerAcceptedWithResult,
  matchEnded,
  matchFound,
  OPTIONS,
  questionRevealed,
  questionStarted,
  scoreboard,
  serverError,
  useFakeRealtime,
  type FakeStomp,
  type ResultOptions,
} from '../../test-utils/realtime.ts';

// Peaks: requests are recorded and run on demand, so tests see exactly what was scheduled.
const flashes = vi.hoisted(() => ({ queue: [] as Array<{ run: (t: number) => void; cancelled: boolean }>, requested: 0 }));
const preload = vi.hoisted(() => ({ preloadLiveMatch: vi.fn(), preloadResults: vi.fn() }));
vi.mock('../preload.ts', () => preload);

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
const monitor = vi.hoisted(() => ({ calls: 0, stops: 0 }));
vi.mock('../../motion/reduceEffects.ts', async (original) => ({
  ...(await original<typeof import('../../motion/reduceEffects.ts')>()),
  monitorBandDrop: () => {
    monitor.calls += 1;
    return () => {
      monitor.stops += 1;
    };
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

let clients: FakeStomp[];
const socket = () => clients[clients.length - 1]!;
const heading = () => screen.getByRole('heading', { level: 1 });
const option = (i: number) => screen.getByTestId(`option-${i}`);
const politeText = () => useAnnouncements.getState().polite.text;
const flushAnnouncements = () => act(async () => {});

type Match = { matchId: string; self: string; opponent: string; seq: number };

/** Joins, opens the socket and delivers MATCH_FOUND (the topic is subscribed then). */
async function found(opponent: { name: string; kind: 'BOT' | 'GUEST' } = { name: 'Vishnu R', kind: 'GUEST' }): Promise<Match> {
  joinQuickMatch();
  await waitFor(() => expect(clients).toHaveLength(1));
  act(() => socket().open());
  const message = matchFound(opponent);
  act(() => socket().deliver(message));
  const { matchId, selfParticipantId, participants } = message.payload;
  const other = participants.find((p) => p.participantId !== selfParticipantId)!.participantId;
  return { matchId, self: selfParticipantId, opponent: other, seq: 0 };
}

function start(m: Match, questionIndex: number, o: Partial<Parameters<typeof questionStarted>[1]> = {}) {
  m.seq += 1;
  const now = Date.now();
  act(() => socket().deliverTopic(m.matchId, questionStarted(m.matchId, { seq: m.seq, questionIndex, startedAt: now, ...o })));
}

function reveal(m: Match, questionIndex: number, self: Partial<ResultOptions>, opponent: Partial<ResultOptions> = {}, extra: { attribution?: string | null; answerIndex?: number } = {}) {
  m.seq += 1;
  act(() =>
    socket().deliverTopic(
      m.matchId,
      questionRevealed(m.matchId, {
        seq: m.seq,
        questionIndex,
        answerIndex: extra.answerIndex ?? 0,
        attribution: extra.attribution,
        results: [
          { participantId: m.self, pickedIndex: 0, correct: true, points: 800, totalScore: 3140, ...self },
          { participantId: m.opponent, pickedIndex: 1, correct: false, points: 0, totalScore: 1980, ...opponent },
        ],
      }),
    ),
  );
}

async function inMatch(opponent?: { name: string; kind: 'BOT' | 'GUEST' }) {
  const m = await found(opponent);
  renderApp('/match');
  return m;
}

beforeEach(async () => {
  stubFetch();
  restartGuestSession();
  clients = useFakeRealtime();
  flashes.queue.length = 0;
  flashes.requested = 0;
  monitor.calls = 0;
  monitor.stops = 0;
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
  syncFromLocation();
  clearScrollMemory();
  resetAnnouncements();
  useReduceEffectsStore.setState({ setting: 'follow-phone', osReduced: false, fallback: null });
  delete (Element.prototype as { animate?: unknown }).animate;
  await act(() => i18n.changeLanguage('ml'));
});

describe('subscribe and lead-in', () => {
  it('starts fetching the Results chunk when the live screen mounts', async () => {
    preload.preloadResults.mockClear();
    const m = await found();
    start(m, 0);
    renderApp('/match');
    await screen.findByTestId('progress');
    expect(preload.preloadResults).toHaveBeenCalledTimes(1);
  });

  it('MATCH_FOUND subscribes before /match opens, so a Q1 that arrives first is not missed', async () => {
    const m = await found();
    expect(socket().isSubscribed(matchTopic(m.matchId))).toBe(true);
    start(m, 0);
    renderApp('/match');
    expect(await screen.findByTestId('progress')).toHaveTextContent('Q 1/10');
    expect(heading()).toHaveTextContent('Which is the longest river in Kerala?');
  });

  it('lead-in: "Get ready…" with the score strip, no tab bar, the live font scope', async () => {
    await inMatch({ name: 'Minnal Bot', kind: 'BOT' });
    expect(heading()).toHaveTextContent('Get ready…');
    const strip = screen.getByTestId('score-strip');
    expect(strip).toHaveTextContent('You');
    expect(strip).toHaveTextContent('Minnal Bot');
    expect(within(strip).getByTestId('bot-badge')).toBeInTheDocument();
    expect(screen.queryByTestId('top-bar')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.querySelector('.font-face-live')).not.toBeNull();
  });

  it('no live match: the "no match" line and Home', async () => {
    renderApp('/match');
    expect(heading()).toHaveTextContent('Match');
    expect(screen.getByText("There's no match on this screen.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Match · Minnal');
  });

  it('?matchId= for another match shows "no match"', async () => {
    await found();
    renderApp('/match?matchId=someone-else');
    expect(screen.getByText("There's no match on this screen.")).toBeInTheDocument();
  });
});

describe('an open question', () => {
  it('Q4: progress, focused heading with the full name, title, options A–D and the first-tap hint; monochrome', async () => {
    const m = await inMatch();
    start(m, 3);
    expect(screen.getByTestId('progress')).toHaveTextContent('Q 4/10');
    expect(heading()).toHaveFocus();
    expect(heading()).toHaveAccessibleName('Which is the longest river in Kerala?, Question 4 of 10, 15 seconds');
    expect(heading()).toHaveAttribute('lang', 'en');
    expect(document.title).toBe('Question 4 / 10 · Minnal');
    for (let i = 0; i < 4; i++) {
      expect(option(i)).toHaveTextContent(OPTIONS[i]!);
      expect(option(i).className).toContain('min-h-[56px]');
      expect(option(i).className).not.toMatch(/truncate|line-clamp|whitespace-nowrap/);
      expect(option(i).style.touchAction).toBe('manipulation');
      expect(within(option(i)).getByText(OPTIONS[i]!)).toHaveAttribute('lang', 'ml');
    }
    expect(screen.getByTestId('footer')).toHaveTextContent('One tap locks your answer');
    // Brick only on the Leave text button (Story 1.9), as DESIGN.md allows.
    expect(document.querySelector('[class*="brick"]:not([data-testid="leave-button"]), [class*="surface-band"], [data-accent]')).toBeNull();
    // Only the top bar is sticky.
    expect(screen.getByTestId('top-bar').className).toContain('sticky');
    expect(document.querySelectorAll('.sticky')).toHaveLength(1);
  });

  it('Malayalam UI: the title and the heading name in Malayalam, per question', async () => {
    await act(() => i18n.changeLanguage('ml'));
    const m = await inMatch();
    start(m, 3);
    expect(document.title).toBe('ചോദ്യം 4 / 10 · മിന്നൽ');
    expect(heading()).toHaveAttribute('lang', 'ml');
    expect(heading()).toHaveAccessibleName('കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏത്?, ചോദ്യം 4 / 10, 15 സെക്കൻഡ്');
    reveal(m, 3, {});
    start(m, 4);
    expect(document.title).toBe('ചോദ്യം 5 / 10 · മിന്നൽ');
    expect(heading()).toHaveFocus();
  });

  it('language fallback: UI ml with no textMl shows English, lang="en", and no EN tag', async () => {
    await act(() => i18n.changeLanguage('ml'));
    const m = await inMatch();
    start(m, 0, { textMl: null });
    expect(heading()).toHaveTextContent('Which is the longest river in Kerala?');
    expect(heading()).toHaveAttribute('lang', 'en');
    expect(screen.queryByTestId('en-tag')).toBeNull();
  });

  it('EN tag: shows the English text, aria-pressed, never a setting; the next question resets it', async () => {
    await act(() => i18n.changeLanguage('ml'));
    const m = await inMatch();
    start(m, 0);
    const tag = screen.getByRole('button', { name: 'ഇംഗ്ലീഷിൽ കാണിക്കുക' });
    expect(tag).toHaveAttribute('aria-pressed', 'false');
    expect(tag).toHaveTextContent('EN');
    expect(tag.className).toContain('min-h-target-min');
    expect(tag.className).toContain('min-w-target-min');
    fireEvent.click(tag);
    expect(tag).toHaveAttribute('aria-pressed', 'true');
    expect(tag).toHaveTextContent('മല');
    expect(heading()).toHaveTextContent('Which is the longest river in Kerala?');
    expect(heading()).toHaveAttribute('lang', 'en');
    expect(i18n.language).toBe('ml');
    reveal(m, 0, {});
    start(m, 1);
    expect(screen.getByTestId('en-tag')).toHaveAttribute('aria-pressed', 'false');
    expect(heading()).toHaveAttribute('lang', 'ml');
  });

  it('English UI: the tag offers Malayalam', async () => {
    const m = await inMatch();
    start(m, 0);
    const tag = screen.getByRole('button', { name: 'Show in Malayalam' });
    expect(tag).toHaveTextContent('മല');
    fireEvent.click(tag);
    expect(heading()).toHaveAttribute('lang', 'ml');
    expect(tag).toHaveTextContent('EN');
  });
});

describe('answering', () => {
  it('tap: pressed on down → "…" after lift → locked on ANSWER_ACCEPTED; "Locked in" once; more taps ignored', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.pointerDown(option(1), { clientX: 10, clientY: 10 });
    expect(option(1)).toHaveAttribute('data-state', 'pressed');
    expect(option(1).className).toContain('border-ink');
    fireEvent.pointerUp(option(1), { clientX: 10, clientY: 10 });
    fireEvent.pointerLeave(option(1)); // touch: leave follows the lift, it must not cancel
    fireEvent.click(option(1));
    expect(socket().bodiesTo(matchAnswer(m.matchId))).toEqual([{ questionIndex: 0, optionIndex: 1 }]);
    expect(option(1)).toHaveAttribute('data-state', 'pending');
    expect(option(1)).toHaveTextContent('…');

    act(() => socket().deliver(answerAccepted(m.matchId, 0)));
    expect(option(1)).toHaveAttribute('data-state', 'locked');
    expect(option(1)).toHaveTextContent('Locked');
    expect(option(1).className).toContain('border-[1.5px]');
    expect(screen.getByTestId('footer')).toHaveTextContent('Locked in · result when time runs out');
    await flushAnnouncements();
    expect(politeText()).toBe('Locked in');
    const seq = useAnnouncements.getState().polite.seq;

    fireEvent.pointerDown(option(2), { clientX: 0, clientY: 0 });
    expect(option(2)).toHaveAttribute('data-state', 'idle');
    fireEvent.click(option(2));
    fireEvent.click(option(1));
    expect(socket().sentTo(matchAnswer(m.matchId))).toBe(1);
    await flushAnnouncements();
    expect(useAnnouncements.getState().polite.seq).toBe(seq);
  });

  it('keyboard Enter/Space (a click with no pointer) commits', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.keyDown(option(3), { key: 'Enter' });
    fireEvent.click(option(3));
    expect(socket().bodiesTo(matchAnswer(m.matchId))).toEqual([{ questionIndex: 0, optionIndex: 3 }]);
  });

  it('slide off: a move over 10 px cancels the press and the click that follows sends nothing', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.pointerDown(option(1), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(option(1), { clientX: 22, clientY: 10 });
    expect(option(1)).toHaveAttribute('data-state', 'idle');
    fireEvent.pointerUp(option(1), { clientX: 22, clientY: 10 });
    fireEvent.click(option(1));
    expect(socket().sentTo(matchAnswer(m.matchId))).toBe(0);
    // A small wobble still counts as a tap.
    fireEvent.pointerDown(option(2), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(option(2), { clientX: 16, clientY: 14 });
    fireEvent.pointerUp(option(2));
    fireEvent.click(option(2));
    expect(socket().bodiesTo(matchAnswer(m.matchId))).toEqual([{ questionIndex: 0, optionIndex: 2 }]);
  });

  it('pointerleave or pointercancel while down cancels', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.pointerDown(option(0), { clientX: 0, clientY: 0 });
    fireEvent.pointerLeave(option(0));
    fireEvent.click(option(0));
    fireEvent.pointerDown(option(0), { clientX: 0, clientY: 0 });
    fireEvent.pointerCancel(option(0));
    fireEvent.click(option(0));
    expect(socket().sentTo(matchAnswer(m.matchId))).toBe(0);
  });

  it('ERROR ANSWER_REJECTED while pending: the option unlocks and nothing is shown', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.click(option(1));
    expect(option(1)).toHaveAttribute('data-state', 'pending');
    act(() => socket().deliver(serverError('ANSWER_REJECTED', m.matchId)));
    expect(option(1)).toHaveAttribute('data-state', 'idle');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('footer')).toHaveTextContent('One tap locks your answer');
    expect(liveGameStore.getState().phase).toBe('found');
  });
});

describe('opponent status', () => {
  it('"thinking" → "answered" from SCOREBOARD, announced once per question, never the pick', async () => {
    const m = await inMatch();
    start(m, 0);
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('thinking…');
    m.seq += 1;
    act(() => socket().deliverTopic(m.matchId, scoreboard(m.matchId, m.seq, 0, [m.opponent])));
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('answered');
    await flushAnnouncements();
    expect(politeText()).toBe('Vishnu R answered');
    const seq = useAnnouncements.getState().polite.seq;
    m.seq += 1;
    act(() => socket().deliverTopic(m.matchId, scoreboard(m.matchId, m.seq, 0, [m.opponent, m.self])));
    await flushAnnouncements();
    expect(useAnnouncements.getState().polite.seq).toBe(seq);
    for (let i = 0; i < 4; i++) expect(option(i)).not.toHaveTextContent('Vishnu');
    // A duplicate (seq ≤ lastSeq) is ignored.
    act(() => socket().deliverTopic(m.matchId, scoreboard(m.matchId, m.seq, 0, [])));
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('answered');

    reveal(m, 0, {});
    start(m, 1);
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('thinking…');
    m.seq += 1;
    act(() => socket().deliverTopic(m.matchId, scoreboard(m.matchId, m.seq, 1, [m.opponent])));
    await flushAnnouncements();
    expect(politeText()).toContain('Vishnu R answered');
  });
});

describe('countdown', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(() => true), configurable: true, writable: true });
  });
  afterEach(() => {
    delete (navigator as { vibrate?: unknown }).vibrate;
  });

  it('runs from server time (offset +2 s): label, aria-label, one bar transition; 5 s cue and vibrate once', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const now = Date.now();
    // The server clock is 2 s ahead: its deadline is 15 s after its own now.
    start(m, 0, { startedAt: now + 2000, serverTime: now + 2000 });
    const seconds = screen.getByTestId('seconds');
    expect(seconds).toHaveTextContent('15 s');
    expect(seconds).toHaveAttribute('aria-label', '15 seconds');
    expect(seconds).not.toHaveAttribute('aria-live');
    expect(seconds.closest('[aria-live], [role="status"], [role="timer"], [role="alert"]')).toBeNull();
    const bar = screen.getByTestId('timer-bar');
    expect(bar.style.transform).toBe('scaleX(0)');
    expect(bar.style.transition).toBe('transform 15000ms linear');
    expect(bar.style.transformOrigin).toBe('left');
    expect(bar.style.willChange).toBe('transform');

    act(() => vi.advanceTimersByTime(6000));
    expect(seconds).toHaveTextContent('9 s');
    expect(seconds).toHaveAttribute('aria-label', '9 seconds');
    expect(navigator.vibrate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(4000));
    expect(seconds).toHaveTextContent('5 s');
    await flushAnnouncements();
    expect(politeText()).toBe('5 seconds left');
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(30);

    act(() => vi.advanceTimersByTime(10_000));
    expect(seconds).toHaveTextContent('0 s');
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    expect(useAnnouncements.getState().polite.seq).toBe(1);
  });

  it('re-arms per question: Q2 restarts the bar and gets its own 5 s cue and vibration', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    start(m, 0, { serverTime: Date.now() });
    act(() => vi.advanceTimersByTime(10_000));
    await flushAnnouncements();
    expect(politeText()).toBe('5 seconds left');
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5_000));
    reveal(m, 0, {});
    await flushAnnouncements();
    act(() => vi.advanceTimersByTime(2_000));
    const bar = screen.getByTestId('timer-bar');
    bar.style.transition = 'stale';
    start(m, 1, { serverTime: Date.now() });
    expect(screen.getByTestId('seconds')).toHaveTextContent('15 s');
    expect(bar.style.transition).toBe('transform 15000ms linear');
    expect(bar.style.transform).toBe('scaleX(0)');
    act(() => vi.advanceTimersByTime(4_000));
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(6_000));
    await flushAnnouncements();
    expect(politeText()).toBe('5 seconds left');
    expect(navigator.vibrate).toHaveBeenCalledTimes(2);
    expect(useAnnouncements.getState().polite.seq).toBeGreaterThanOrEqual(3);
  });

  it('the bar is drawn against deadline − startedAt, on the offset captured at the start', async () => {
    useReduceEffectsStore.setState({ setting: 'on' });
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    start(m, 0, { serverTime: Date.now(), windowMs: 10_000 });
    const bar = screen.getByTestId('timer-bar');
    expect(bar.style.transform).toBe('scaleX(1)');
    // A later message with a different serverTime does not move this question's clock.
    m.seq += 1;
    act(() => socket().deliverTopic(m.matchId, scoreboard(m.matchId, m.seq, 0, [], new Date(Date.now() + 3000).toISOString())));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('seconds')).toHaveTextContent('9 s');
    expect(bar.style.transform).toBe(`scaleX(${9 / 10})`);
  });

  it('a late render starts the bar shorter, never at full width', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    start(m, 0, { startedAt: Date.now() - 6000, serverTime: Date.now() });
    expect(screen.getByTestId('seconds')).toHaveTextContent('9 s');
    expect(screen.getByTestId('timer-bar').style.transition).toBe('transform 9000ms linear');
  });

  it('reduced path: the bar steps once a second with no transition', async () => {
    useReduceEffectsStore.setState({ setting: 'on' });
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    start(m, 0, { serverTime: Date.now() });
    const bar = screen.getByTestId('timer-bar');
    expect(bar.style.transition).toBe('none');
    expect(bar.style.transform).toBe('scaleX(1)');
    act(() => vi.advanceTimersByTime(1000));
    expect(bar.style.transform).toBe(`scaleX(${14 / 15})`);
    act(() => vi.advanceTimersByTime(500));
    expect(bar.style.transform).toBe(`scaleX(${14 / 15})`);
    act(() => vi.advanceTimersByTime(500));
    expect(bar.style.transform).toBe(`scaleX(${13 / 15})`);
  });
});

describe('reveal', () => {
  it('correct: band, volt points, total and one strike through requestFlash; the correct option gets the volt ✓; announced', async () => {
    const m = await inMatch();
    start(m, 3);
    fireEvent.click(option(0));
    act(() => socket().deliver(answerAccepted(m.matchId, 3)));
    const focused = document.activeElement;
    reveal(m, 3, { pickedIndex: 0, correct: true, points: 800, totalScore: 3140 }, { pickedIndex: 1 });

    const band = screen.getByTestId('reveal-band');
    expect(band).toHaveAttribute('data-correct', 'true');
    expect(band).toHaveTextContent('Question 4 · Correct');
    expect(band).toHaveTextContent('പെരിയാർ');
    expect(screen.getByTestId('band-points')).toHaveTextContent('+800');
    expect(screen.getByTestId('band-points')).toHaveAttribute('data-accent');
    expect(screen.getByTestId('bolt')).toHaveAttribute('data-accent');
    expect(screen.getByTestId('band-points').className).toContain('text-peak-points');
    expect(screen.getByTestId('band-total')).toHaveTextContent('total 3,140');
    expect(band.style.opacity).toBe('0'); // waits for its flash slot
    expect(flashes.requested).toBe(2); // drop, then strike

    expect(runFlashes()).toBe(2);
    expect(band.style.opacity).toBe('1');
    expect(monitor.calls).toBe(1);
    const drop = animations.find((a) => a.element === band)!;
    expect(drop.options.duration).toBe(160);
    expect(drop.keyframes).toEqual([{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }]);
    const strike = animations.find((a) => a.element === screen.getByTestId('bolt'))!;
    expect(strike.options.duration).toBe(400);
    for (const { keyframes } of animations) {
      for (const frame of keyframes) {
        expect(Object.keys(frame).every((k) => ['transform', 'opacity', 'offset'].includes(k))).toBe(true);
      }
    }

    expect(option(0)).toHaveAttribute('data-state', 'correct');
    expect(within(option(0)).getByTestId('correct-tile')).toHaveTextContent('✓');
    expect(within(option(0)).getByTestId('correct-tile')).toHaveAttribute('data-accent');
    expect(option(0)).toHaveTextContent('You');
    expect(option(1)).toHaveAttribute('data-state', 'muted');
    expect(within(option(1)).getByTestId('picks-1')).toHaveTextContent('Vishnu R');
    expect(option(2).className).toContain('text-muted');

    expect(screen.getByTestId('reveal-details')).toHaveTextContent('പെരിയാർ (244 കി.മീ)');
    expect(screen.getByTestId('attribution')).toHaveTextContent('Kerala PSC LDC 2019');
    expect(screen.getByTestId('self-total')).toHaveTextContent('3,140');
    expect(screen.getByTestId('opponent-total')).toHaveTextContent('1,980');
    await flushAnnouncements();
    expect(politeText()).toContain('Correct. Answer: പെരിയാർ. +800, total 3,140');
    expect(document.activeElement).toBe(focused);
    expect(screen.queryByTestId('footer')).toBeNull();
  });

  it('wrong: no bolt or volt; names the answer; own pick brick, others muted, the opponent named', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.click(option(2));
    reveal(m, 0, { pickedIndex: 2, correct: false, points: 0, totalScore: 2340 }, { pickedIndex: 0, correct: true, points: 900, totalScore: 900 });
    const band = screen.getByTestId('reveal-band');
    expect(band).toHaveAttribute('data-correct', 'false');
    expect(band).toHaveTextContent('Correct answer');
    expect(band).toHaveTextContent("It's പെരിയാർ. Get the next one!");
    expect(screen.queryByTestId('bolt')).toBeNull();
    expect(screen.queryByTestId('band-points')).toBeNull();
    // Volt classes are checked in design/peak (the only place they may be named).
    expect(band.querySelector('[data-accent]')).toBeNull();
    expect(flashes.requested).toBe(1);
    runFlashes();
    expect(option(2)).toHaveAttribute('data-state', 'wrong-pick');
    expect(option(2).className).toContain('border-brick');
    expect(option(2)).toHaveTextContent('You');
    expect(option(1).className).toContain('text-muted');
    expect(option(3).className).toContain('text-muted');
    expect(within(option(0)).getByTestId('picks-0')).toHaveTextContent('Vishnu R');
    await flushAnnouncements();
    expect(politeText()).toBe('Wrong. Answer: പെരിയാർ. Total 2,340');
  });

  it('no answer: the wrong path with no brick', async () => {
    const m = await inMatch();
    start(m, 0);
    reveal(m, 0, { pickedIndex: null, correct: false, points: 0, totalScore: 0 });
    expect(screen.getByTestId('reveal-band')).toHaveAttribute('data-correct', 'false');
    expect(document.querySelector('[class*="border-brick"]')).toBeNull();
    for (const i of [1, 2, 3]) expect(option(i)).toHaveAttribute('data-state', 'muted');
  });

  it('renders the payload as sent: no correctness or points of its own', async () => {
    const m = await inMatch();
    start(m, 0);
    // The payload says wrong even though pickedIndex equals answerIndex, and odd numbers.
    reveal(m, 0, { pickedIndex: 0, correct: false, points: 0, totalScore: 1234 }, {}, { answerIndex: 0 });
    expect(screen.getByTestId('reveal-band')).toHaveAttribute('data-correct', 'false');
    expect(screen.getByTestId('band-total')).toHaveTextContent('total 1,234');
    start(m, 1);
    reveal(m, 1, { pickedIndex: 3, correct: true, points: 777, totalScore: 2011 }, {}, { answerIndex: 2 });
    expect(screen.getByTestId('band-points')).toHaveTextContent('+777');
    expect(screen.getByTestId('band-total')).toHaveTextContent('total 2,011');
  });

  it('attribution missing: "source not available"', async () => {
    const m = await inMatch();
    start(m, 0);
    reveal(m, 0, {}, {}, { attribution: null });
    expect(screen.getByTestId('attribution')).toHaveTextContent('source not available');
    expect(screen.getByTestId('reveal-details').querySelector('[lang="ml"]')).toHaveTextContent('പെരിയാർ (244 കി.മീ)');
  });

  it('reduced path: a 200 ms fade, no drop or strike', async () => {
    useReduceEffectsStore.setState({ setting: 'on' });
    const m = await inMatch();
    start(m, 0);
    reveal(m, 0, {});
    expect(flashes.requested).toBe(1);
    runFlashes();
    const band = screen.getByTestId('reveal-band');
    expect(animations).toHaveLength(1);
    expect(animations[0]!.element).toBe(band);
    expect(animations[0]!.options.duration).toBe(200);
    expect(animations[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(monitor.calls).toBe(0);
  });

  it('a new question cancels a peak that has not started', async () => {
    const m = await inMatch();
    start(m, 0);
    reveal(m, 0, {});
    start(m, 1);
    expect(screen.queryByTestId('reveal-band')).toBeNull();
    expect(runFlashes()).toBe(0);
  });

  it('the opponent status is hidden over a reveal and after the end', async () => {
    const m = await inMatch();
    start(m, 0);
    expect(screen.getByTestId('opponent-status')).toBeInTheDocument();
    reveal(m, 0, {});
    expect(screen.queryByTestId('opponent-status')).toBeNull();
    start(m, 9);
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('thinking…');
    reveal(m, 9, {});
    expect(screen.queryByTestId('opponent-status')).toBeNull();
  });

  /** MATCH_ENDED for `m`: she won 3,140 to 1,980 over ten questions. */
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

  it('the end hands off to /results after the reveal hold, once MATCH_ENDED is in', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    start(m, 9);
    reveal(m, 9, { totalScore: 7420 });
    expect(screen.getByTestId('reveal-band')).toBeInTheDocument();
    expect(screen.queryByTestId('match-over')).toBeNull();
    deliverEnded(m);
    await act(() => vi.advanceTimersByTimeAsync(RESULTS_HOLD_MS - 100));
    expect(window.location.pathname).toBe('/match');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(window.location.pathname).toBe('/results');
    expect(liveGameStore.getState().live?.ended?.matchId).toBe(m.matchId);
  });

  it('MATCH_ENDED before the final reveal is held: the results open after the hold that follows the reveal', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    start(m, 9);
    deliverEnded(m);
    await act(() => vi.advanceTimersByTimeAsync(RESULTS_HOLD_MS * 2));
    expect(window.location.pathname).toBe('/match');
    reveal(m, 9, { totalScore: 3140 });
    await act(() => vi.advanceTimersByTimeAsync(RESULTS_HOLD_MS - 100));
    expect(window.location.pathname).toBe('/match');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(window.location.pathname).toBe('/results');
  });

  it('with no MATCH_ENDED the results open anyway after the hold and the wait, on the minimal view', async () => {
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    start(m, 9);
    reveal(m, 9, { totalScore: 7420 });
    await act(() => vi.advanceTimersByTimeAsync(RESULTS_HOLD_MS + 50));
    await act(() => vi.advanceTimersByTimeAsync(MATCH_ENDED_WAIT_MS - 100));
    expect(window.location.pathname).toBe('/match');
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(window.location.pathname).toBe('/results');
    expect(screen.getByTestId('result-self')).toHaveTextContent('7,420');
    expect(screen.queryByTestId('results-pending')).toBeNull();
  });

  it('joining again clears the ended match: /match no longer shows it', async () => {
    const m = await inMatch();
    start(m, 9);
    reveal(m, 9, {});
    expect(socket().isSubscribed(matchTopic(m.matchId))).toBe(false);
    act(() => navigate('/'));
    act(() => joinQuickMatch());
    act(() => navigate('/match'));
    expect(screen.getByText("There's no match on this screen.")).toBeInTheDocument();
    expect(screen.queryByTestId('timer-bar')).toBeNull();
  });

  it('end: after the 10th reveal the last reveal stays until the hand-off, with no "Match over" line', async () => {
    const m = await inMatch();
    start(m, 9);
    reveal(m, 9, { totalScore: 7420 });
    expect(screen.getByTestId('reveal-band')).toBeInTheDocument();
    expect(screen.queryByTestId('match-over')).toBeNull();
    expect(window.location.pathname).toBe('/match');
  });
});

describe('1v1: her own result at the ack (Story 1.11)', () => {
  function ack(m: Match, questionIndex: number, result: { correct: boolean; points: number; answerIndex: number; totalScore: number }) {
    act(() => socket().deliver(answerAcceptedWithResult(m.matchId, questionIndex, result)));
  }

  it('own correct: band, volt points, total and one strike at once; announced; "Waiting for <name>…"', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.click(option(0));
    expect(screen.queryByTestId('reveal-band')).toBeNull();
    ack(m, 0, { correct: true, points: 750, answerIndex: 0, totalScore: 1500 });

    const band = screen.getByTestId('reveal-band');
    expect(band).toHaveAttribute('data-correct', 'true');
    expect(band).toHaveTextContent('Question 1 · Correct');
    expect(band).toHaveTextContent('പെരിയാർ');
    expect(screen.getByTestId('band-points')).toHaveTextContent('+750');
    expect(screen.getByTestId('band-total')).toHaveTextContent('total 1,500');
    expect(flashes.requested).toBe(2); // drop, then strike
    expect(runFlashes()).toBe(2);
    expect(band.style.opacity).toBe('1');
    expect(animations.find((a) => a.element === screen.getByTestId('bolt'))).toBeDefined();

    // The answer and her pick only: no opponent pick, no final styling, no explanation yet.
    expect(option(0)).toHaveAttribute('data-state', 'correct');
    expect(option(0)).toHaveTextContent('You');
    for (const i of [1, 2, 3]) expect(option(i)).toHaveAttribute('data-state', 'idle');
    expect(screen.queryByTestId('picks-1')).toBeNull();
    expect(screen.queryByTestId('reveal-details')).toBeNull();
    expect(screen.getByTestId('footer')).toHaveTextContent('Waiting for Vishnu R…');
    await flushAnnouncements();
    expect(politeText()).toBe('Correct. Answer: പെരിയാർ. +750, total 1,500');
    const seq = useAnnouncements.getState().polite.seq;

    // The close adds the opponent's pick, the explanation and the attribution: no second peak.
    reveal(m, 0, { pickedIndex: 0, correct: true, points: 750, totalScore: 1500 }, { pickedIndex: 1 });
    expect(screen.getByTestId('reveal-band')).toBe(band);
    expect(flashes.requested).toBe(2);
    expect(runFlashes()).toBe(0);
    expect(within(option(1)).getByTestId('picks-1')).toHaveTextContent('Vishnu R');
    expect(option(1)).toHaveAttribute('data-state', 'muted');
    expect(screen.getByTestId('reveal-details')).toHaveTextContent('പെരിയാർ (244 കി.മീ)');
    expect(screen.getByTestId('attribution')).toHaveTextContent('Kerala PSC LDC 2019');
    expect(screen.getByTestId('band-total')).toHaveTextContent('total 1,500');
    expect(screen.queryByTestId('footer')).toBeNull();
    await flushAnnouncements();
    expect(useAnnouncements.getState().polite.seq).toBe(seq);
    expect(monitor.calls).toBe(1);
  });

  it('own wrong: the band names the answer, her pick brick, no bolt or volt; the rest waits for the close', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.click(option(2));
    ack(m, 0, { correct: false, points: 0, answerIndex: 0, totalScore: 900 });
    const band = screen.getByTestId('reveal-band');
    expect(band).toHaveAttribute('data-correct', 'false');
    expect(band).toHaveTextContent("It's പെരിയാർ. Get the next one!");
    expect(screen.queryByTestId('bolt')).toBeNull();
    expect(band.querySelector('[data-accent]')).toBeNull();
    expect(flashes.requested).toBe(1);
    expect(option(2)).toHaveAttribute('data-state', 'wrong-pick');
    expect(option(2).className).toContain('border-brick');
    expect(option(0)).toHaveAttribute('data-state', 'correct');
    for (const i of [1, 3]) expect(option(i)).toHaveAttribute('data-state', 'idle');
    expect(screen.getByTestId('footer')).toHaveTextContent('Waiting for Vishnu R…');
    await flushAnnouncements();
    expect(politeText()).toBe('Wrong. Answer: പെരിയാർ. Total 900');

    reveal(m, 0, { pickedIndex: 2, correct: false, points: 0, totalScore: 900 }, { pickedIndex: 0, correct: true, points: 900, totalScore: 900 });
    expect(screen.getByTestId('reveal-band')).toBe(band);
    expect(flashes.requested).toBe(1);
    expect(within(option(0)).getByTestId('picks-0')).toHaveTextContent('Vishnu R');
    for (const i of [1, 3]) expect(option(i)).toHaveAttribute('data-state', 'muted');
  });

  it('reduced path: a 200 ms fade at the ack, nothing more at the close', async () => {
    useReduceEffectsStore.setState({ setting: 'on' });
    const m = await inMatch();
    start(m, 0);
    fireEvent.click(option(0));
    ack(m, 0, { correct: true, points: 1000, answerIndex: 0, totalScore: 1000 });
    expect(flashes.requested).toBe(1);
    runFlashes();
    expect(animations).toHaveLength(1);
    expect(animations[0]!.options.duration).toBe(200);
    reveal(m, 0, { pickedIndex: 0, correct: true, points: 1000, totalScore: 1000 });
    expect(flashes.requested).toBe(1);
  });

  it('a receipt-only ack keeps the Story 1.8 flow: locked footer, the band at the close', async () => {
    const m = await inMatch();
    start(m, 0);
    fireEvent.click(option(0));
    act(() => socket().deliver(answerAccepted(m.matchId, 0)));
    expect(screen.queryByTestId('reveal-band')).toBeNull();
    expect(screen.getByTestId('footer')).toHaveTextContent('Locked in · result when time runs out');
    reveal(m, 0, {});
    expect(screen.getByTestId('reveal-band')).toHaveAttribute('data-correct', 'true');
  });

  it('reduced path: an early close mid-second freezes the stepped bar on the whole second, rounded up', async () => {
    useReduceEffectsStore.setState({ setting: 'on' });
    const m = await inMatch();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    start(m, 0, { serverTime: Date.now() });
    fireEvent.click(option(0));
    ack(m, 0, { correct: true, points: 800, answerIndex: 0, totalScore: 800 });
    act(() => vi.advanceTimersByTime(5_500));
    reveal(m, 0, { pickedIndex: 0, correct: true, points: 800, totalScore: 800 });
    const bar = screen.getByTestId('timer-bar');
    const seconds = screen.getByTestId('seconds');
    expect(bar.style.transition).toBe('none');
    expect(bar.style.transform).toBe(`scaleX(${10 / 15})`);
    expect(seconds).toHaveTextContent('10 s');
    act(() => vi.advanceTimersByTime(10_000));
    expect(bar.style.transition).toBe('none');
    expect(bar.style.transform).toBe(`scaleX(${10 / 15})`);
    expect(seconds).toHaveTextContent('10 s');
  });

  it('an early close freezes the timer: the bar holds, the label stops, no 5 s cue later', async () => {
    Object.defineProperty(navigator, 'vibrate', { value: vi.fn(() => true), configurable: true, writable: true });
    try {
      const m = await inMatch();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
      start(m, 0, { serverTime: Date.now() });
      fireEvent.click(option(0));
      ack(m, 0, { correct: true, points: 800, answerIndex: 0, totalScore: 800 });
      act(() => vi.advanceTimersByTime(6000));
      const seconds = screen.getByTestId('seconds');
      expect(seconds).toHaveTextContent('9 s');
      reveal(m, 0, { pickedIndex: 0, correct: true, points: 800, totalScore: 800 });
      const bar = screen.getByTestId('timer-bar');
      expect(bar.style.transition).toBe('none');
      expect(bar.style.transform).toBe(`scaleX(${9 / 15})`);
      await flushAnnouncements();
      const seq = useAnnouncements.getState().polite.seq;
      act(() => vi.advanceTimersByTime(10_000));
      expect(seconds).toHaveTextContent('9 s');
      expect(bar.style.transform).toBe(`scaleX(${9 / 15})`);
      expect(navigator.vibrate).not.toHaveBeenCalled();
      await flushAnnouncements();
      expect(useAnnouncements.getState().polite.seq).toBe(seq);
    } finally {
      delete (navigator as { vibrate?: unknown }).vibrate;
    }
  });
});

describe('Topic Duel (Story 4.2)', () => {
  const TOPIC = { topicId: '7c1f0c9a-1111-4a2b-8c3d-0e1f2a3b4c5d', name: 'Kerala History', subjectName: 'History' };

  async function duel(): Promise<Match> {
    joinQuickMatch(TOPIC.topicId);
    await waitFor(() => expect(clients).toHaveLength(1));
    act(() => socket().open());
    const message = matchFound({ name: 'Vishnu R', kind: 'GUEST' });
    act(() => socket().deliver({ ...message, payload: { ...message.payload, mode: 'TOPIC_DUEL', topic: TOPIC } }));
    const { matchId, selfParticipantId, participants } = message.payload;
    return {
      matchId,
      self: selfParticipantId,
      opponent: participants.find((p) => p.participantId !== selfParticipantId)!.participantId,
      seq: 0,
    };
  }

  it('the mode label beside the EN tag reads "Topic Duel · <topic>" and wraps instead of truncating; the title keeps its form', async () => {
    const m = await duel();
    start(m, 3);
    renderApp('/match');
    const label = screen.getByTestId('mode-label');
    expect(label).toHaveTextContent('Topic Duel · Kerala History');
    expect(label.className).toContain('break-words');
    expect(label.className).not.toContain('truncate');
    expect(screen.getByTestId('en-tag')).toBeInTheDocument();
    expect(document.title).toBe('Question 4 / 10 · Minnal');
  });

  it('in Malayalam the label is "ടോപ്പിക് ഡ്യുവൽ · <topic>"', async () => {
    await act(() => i18n.changeLanguage('ml'));
    const m = await duel();
    start(m, 0);
    renderApp('/match');
    expect(screen.getByTestId('mode-label')).toHaveTextContent('ടോപ്പിക് ഡ്യുവൽ · Kerala History');
  });

  it('a Quick Match keeps its label', async () => {
    const m = await found();
    start(m, 0);
    renderApp('/match');
    expect(screen.getByTestId('mode-label')).toHaveTextContent('Quick Match');
  });
});
