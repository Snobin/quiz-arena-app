import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { announce } from '../../shell/announce.ts';

/** When the one-off "5 seconds left" cue fires. */
export const FIVE_SECONDS_MS = 5_000;

type TimerBarProps = {
  questionIndex: number;
  total: number;
  /** When the window opened, server time (ISO-8601). The bar is drawn against deadline − startedAt. */
  startedAt: string;
  /** The server deadline (ISO-8601). */
  deadline: string;
  clockOffsetMs: number;
  reduced: boolean;
  /**
   * The question has closed (its reveal is in), possibly before the deadline (Story 1.11): the
   * bar holds where it is, the label stops and no 5 s cue follows.
   */
  closed?: boolean;
};

/**
 * The sticky top bar (≤ 48px): the hairline timer, the seconds label and "Q n/10".
 *
 * Time left is `deadline − (Date.now() + clockOffsetMs)`, clamped at 0: server time, never a
 * local 15 s timer, and it never pauses. The offset is captured once when the question starts,
 * so the bar and the label run on the same clock; the window is `deadline − startedAt`. The bar is one CSS `transform: scaleX()` transition
 * to 0 per question (compositor only); a late render starts it already shorter. Under the
 * reduced path it steps once per second with no transition. The seconds label ticks once per
 * second with a full-word aria-label and is never a live region. At 5 s, once per question:
 * a polite announcement and a 30 ms vibration where supported. Once `closed`, the bar freezes at
 * its current position (no transition), the label stops and the cue is never fired.
 */
export function TimerBar({ questionIndex, total, startedAt, deadline, clockOffsetMs, reduced, closed = false }: TimerBarProps) {
  const { t } = useTranslation();
  const barRef = useRef<HTMLDivElement>(null);
  const offset = useRef(clockOffsetMs);
  offset.current = clockOffsetMs;
  /** The offset captured when this question started, kept through its close (a later message may move it). */
  const questionOffset = useRef<{ key: string; offsetMs: number } | null>(null);
  const fiveSecondsFor = useRef<string | null>(null);
  const fiveSecondsText = useRef('');
  fiveSecondsText.current = t('match.fiveSeconds');
  const [seconds, setSeconds] = useState(0);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const deadlineMs = Date.parse(deadline);
    const windowMs = Math.max(1, deadlineMs - Date.parse(startedAt));
    // Once per question: bar and label share it, and the freeze at the close uses it too.
    const questionKey = `${deadline}:${questionIndex}`;
    if (questionOffset.current?.key !== questionKey) {
      questionOffset.current = { key: questionKey, offsetMs: offset.current };
    }
    const offsetMs = questionOffset.current.offsetMs;
    const remaining = () => Math.max(0, deadlineMs - (Date.now() + offsetMs));
    const scale = (ms: number) => Math.min(1, ms / windowMs);

    const start = remaining();
    if (closed) {
      // Frozen where it is now: no transition, no further ticks, no cue.
      const whole = Math.ceil(start / 1000);
      if (bar) {
        bar.style.transition = 'none';
        bar.style.transform = `scaleX(${reduced ? scale(whole * 1000) : scale(start)})`;
      }
      setSeconds(whole);
      return undefined;
    }
    if (bar) {
      bar.style.transition = 'none';
      bar.style.transform = `scaleX(${reduced ? scale(Math.ceil(start / 1000) * 1000) : scale(start)})`;
      if (!reduced && start > 0) {
        // Commit the start value, then run one transition to 0 over the time left.
        void bar.getBoundingClientRect();
        bar.style.transition = `transform ${start}ms linear`;
        bar.style.transform = 'scaleX(0)';
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const left = remaining();
      const whole = Math.ceil(left / 1000);
      setSeconds(whole);
      if (reduced && bar) bar.style.transform = `scaleX(${scale(whole * 1000)})`;
      const key = `${deadline}:${questionIndex}`;
      if (left > 0 && left <= FIVE_SECONDS_MS && fiveSecondsFor.current !== key) {
        fiveSecondsFor.current = key;
        announce(fiveSecondsText.current);
        try {
          navigator.vibrate?.(30);
        } catch {
          // Vibration blocked: the announcement still went out.
        }
      }
      if (left > 0) timer = setTimeout(tick, left % 1000 || 1000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [deadline, startedAt, questionIndex, reduced, closed]);

  return (
    <div data-testid="top-bar" className="sticky top-[0] z-10 -mx-4 bg-paper px-4 pb-1 pt-1">
      <div className="h-[2px] overflow-hidden bg-hairline">
        <div
          ref={barRef}
          data-testid="timer-bar"
          aria-hidden="true"
          className="h-full w-full bg-ink"
          style={{ transformOrigin: 'left', willChange: 'transform' }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-label text-muted">
        <span data-testid="progress" className="tabular-nums">
          {t('match.progress', { n: questionIndex + 1, total })}
        </span>
        <span
          data-testid="seconds"
          aria-label={t('match.seconds', { count: seconds })}
          className="font-bold tabular-nums text-ink"
        >
          {t('match.secondsShort', { seconds })}
        </span>
      </div>
    </div>
  );
}
