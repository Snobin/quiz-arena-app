import { motion } from '../design/tokens.ts';

/**
 * The app-wide flash budget (WCAG 2.3.1, EXPERIENCE.md › Flashing and motion): at most one
 * flash-producing transition starts per `motion.flash-window`. Requests queue FIFO and never
 * overlap; a cancelled request never runs.
 *
 * A flash starts inside an animation frame, so the start the budget measures is the frame that
 * paints it, not a timer callback that may land a frame early.
 */
export type FlashRun = (startTime: number) => void;

export type FlashSchedulerEnv = {
  windowMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Runs the callback in the next animation frame with that frame's timestamp. */
  requestFrame?: (callback: (timestamp: number) => void) => void;
};

export type FlashScheduler = {
  requestFlash: (run: FlashRun) => () => void;
  /** Drops every queued flash and the window (tests and the QA fixture). */
  reset: () => void;
};

type Entry = { run: FlashRun; cancelled: boolean };

function defaultNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function defaultFrame(now: () => number): (callback: (timestamp: number) => void) => void {
  if (typeof requestAnimationFrame === 'function') return (callback) => void requestAnimationFrame(callback);
  return (callback) => callback(now());
}

export function createFlashScheduler(env: FlashSchedulerEnv = {}): FlashScheduler {
  const windowMs = env.windowMs ?? motion.flashWindow;
  const now = env.now ?? defaultNow;
  const setTimer = env.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = env.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const requestFrame = env.requestFrame ?? defaultFrame(now);

  const queue: Entry[] = [];
  let lastStart = Number.NEGATIVE_INFINITY;
  let timer: unknown;
  let waiting = false; // a timer or a frame is pending
  let generation = 0;

  const dropCancelled = () => {
    while (queue[0]?.cancelled) queue.shift();
  };

  const pump = () => {
    if (waiting) return;
    dropCancelled();
    if (queue.length === 0) return;
    const wait = lastStart + windowMs - now();
    waiting = true;
    const gen = generation;
    if (wait > 0) {
      timer = setTimer(() => {
        timer = undefined;
        if (gen !== generation) return;
        waiting = false;
        pump();
      }, wait);
      return;
    }
    requestFrame((frameTime) => {
      if (gen !== generation) return;
      waiting = false;
      dropCancelled();
      const entry = queue[0];
      if (!entry) return;
      // A frame timestamp can sit slightly before the timer that asked for it: re-check.
      if (frameTime < lastStart + windowMs) {
        pump();
        return;
      }
      queue.shift();
      lastStart = frameTime;
      try {
        entry.run(frameTime);
      } catch (error) {
        console.error('flash run failed', error);
      }
      pump();
    });
  };

  return {
    requestFlash(run) {
      const entry: Entry = { run, cancelled: false };
      queue.push(entry);
      pump();
      return () => {
        entry.cancelled = true;
      };
    },
    reset() {
      generation += 1;
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
      waiting = false;
      queue.length = 0;
      lastStart = Number.NEGATIVE_INFINITY;
    },
  };
}

const appScheduler = createFlashScheduler();

/**
 * Queues a flash-producing transition app-wide. `run` is called with the start frame's
 * timestamp when the budget allows; the returned function cancels it if it has not started.
 */
export const requestFlash: FlashScheduler['requestFlash'] = (run) => appScheduler.requestFlash(run);

export const resetFlashScheduler: FlashScheduler['reset'] = () => appScheduler.reset();
