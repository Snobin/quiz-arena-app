import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motion } from '../design/tokens.ts';
import { maxPerWindow } from './flashBudget.ts';
import { createFlashScheduler } from './flashScheduler.ts';

// Fake timers; frames run synchronously at the fake clock's time.
const scheduler = () =>
  createFlashScheduler({ now: () => Date.now(), requestFrame: (callback) => callback(Date.now()) });

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('flash scheduler', () => {
  it('matrix: 3 requests at t=0, 100, 200 start at 0, 1000, 2000', () => {
    const { requestFlash } = scheduler();
    const starts: number[] = [];
    const run = (t: number) => starts.push(t);
    requestFlash(run);
    vi.advanceTimersByTime(100);
    requestFlash(run);
    vi.advanceTimersByTime(100);
    requestFlash(run);
    vi.advanceTimersByTime(5000);
    expect(starts).toEqual([0, 1000, 2000]);
    expect(motion.flashWindow).toBe(1000);
  });

  it('matrix: a cancelled request is skipped and the next one takes its slot', () => {
    const { requestFlash } = scheduler();
    const order: string[] = [];
    requestFlash(() => order.push(`a@${Date.now()}`));
    const cancelB = requestFlash(() => order.push(`b@${Date.now()}`));
    requestFlash(() => order.push(`c@${Date.now()}`));
    cancelB();
    vi.advanceTimersByTime(5000);
    expect(order).toEqual(['a@0', 'c@1000']);
  });

  it('runs FIFO and never starts two flashes within one window', () => {
    const { requestFlash } = scheduler();
    const starts: Array<[string, number]> = [];
    for (const name of ['a', 'b', 'c', 'd', 'e']) requestFlash((t) => starts.push([name, t]));
    vi.advanceTimersByTime(999);
    expect(starts).toEqual([['a', 0]]);
    vi.advanceTimersByTime(10_000);
    expect(starts.map(([name]) => name)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(maxPerWindow(starts.map(([, t]) => t), motion.flashWindow)).toBe(1);
  });

  it('starts at once after a quiet window, and cancelling a started flash is a no-op', () => {
    const { requestFlash } = scheduler();
    const run = vi.fn();
    const cancel = requestFlash(run);
    cancel();
    vi.advanceTimersByTime(3000);
    requestFlash(run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('re-checks the window when the frame lands before it ends', () => {
    const frames: Array<(t: number) => void> = [];
    const { requestFlash } = createFlashScheduler({ now: () => Date.now(), requestFrame: (cb) => frames.push(cb) });
    const starts: number[] = [];
    requestFlash((t) => starts.push(t));
    requestFlash((t) => starts.push(t));
    frames.shift()!(0);
    vi.advanceTimersByTime(1000);
    frames.shift()!(990); // an early frame timestamp: must not start yet
    expect(starts).toEqual([0]);
    frames.shift()!(1005);
    expect(starts).toEqual([0, 1005]);
  });

  it('reset drops queued flashes', () => {
    const { requestFlash, reset } = scheduler();
    const run = vi.fn();
    requestFlash(run);
    requestFlash(run);
    reset();
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('maxPerWindow (the /__flash readout)', () => {
  it('counts starts in a half-open window', () => {
    expect(maxPerWindow([], 1000)).toBe(0);
    expect(maxPerWindow([0, 1000, 2000], 1000)).toBe(1);
    expect(maxPerWindow([0, 999, 2000], 1000)).toBe(2);
    expect(maxPerWindow([0, 100, 200, 1500], 1000)).toBe(3);
  });
});
