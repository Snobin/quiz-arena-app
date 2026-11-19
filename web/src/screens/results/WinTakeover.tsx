import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { animatePeak } from '../../design/peak/animate.ts';
import { TAKEOVER_SURFACE, TakeoverBolt, VoltText } from '../../design/peak/volt.tsx';
import { motion } from '../../design/tokens.ts';
import { formatNumber, formatSigned } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import { requestFlash } from '../../motion/flashScheduler.ts';

export type WinTakeoverProps = {
  selfScore: number;
  /** The best opponent, muted under her score; null when there is none. */
  opponent: { name: string; score: number } | null;
  reduced: boolean;
  /** Her rating change, shown only when it has already arrived (the takeover opens before the fetch can finish). */
  delta?: number | null;
  /** Called once the collapse has finished: the caller unmounts it. */
  onDone: () => void;
};

/**
 * The win takeover (DESIGN.md › Win takeover, EXPERIENCE.md › Results): a full-screen band with
 * the large volt bolt, "You won!", her score in volt and the opponent's muted. It is a
 * `role="dialog"` labelled by its title, with Continue focused once it shows.
 *
 * - The flood goes through the flash scheduler, so it starts at least `motion.flashWindow` after
 *   the last reveal's strike; the bolt shows with it (one flash, no second strike).
 * - It holds `motion.winHold` after the flood, or until Continue, a tap anywhere or Esc, then
 *   collapses over `motion.winCollapse` (opacity only). The dismissing tap is consumed here.
 * - Reduced effects: a `motion.reducedFade` fade in and out, and no auto-advance (Continue only).
 *   A screen reader cannot be detected, so it still auto-advances there; focus then lands on the
 *   results heading, which carries the result (a known limitation against UX-DR38).
 */
export function WinTakeover({ selfScore, opponent, reduced, delta, onDone }: WinTakeoverProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const collapsing = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cancelFlood = useRef<() => void>(() => {});
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const collapse = () => {
    if (collapsing.current) return;
    collapsing.current = true;
    cancelFlood.current();
    for (const timer of timers.current) clearTimeout(timer);
    const root = rootRef.current;
    const duration = reduced ? motion.reducedFade : motion.winCollapse;
    if (root) {
      animatePeak(root, [{ opacity: Number(root.style.opacity || '0') }, { opacity: 0 }], {
        duration,
        easing: motion.easingDefault,
      });
    }
    timers.current = [setTimeout(() => onDoneRef.current(), duration)];
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    cancelFlood.current = requestFlash(() => {
      if (collapsing.current) return;
      // Focus Continue once the takeover is visible, never while it is still at opacity 0.
      if (reduced) {
        animatePeak(root, [{ opacity: 0 }, { opacity: 1 }], { duration: motion.reducedFade, easing: motion.easingDefault });
        continueRef.current?.focus();
        return; // Continue only.
      }
      root.style.opacity = '1';
      continueRef.current?.focus();
      animatePeak(root, [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }], {
        duration: motion.winFlood,
        easing: motion.easingDefault,
      });
      timers.current.push(setTimeout(collapse, motion.winFlood + motion.winHold));
    });
    return () => {
      cancelFlood.current();
      for (const timer of timers.current) clearTimeout(timer);
    };
  }, []);

  // A tap anywhere (Continue included) dismisses it; the event goes no further.
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    collapse();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      collapse();
    }
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="win-takeover"
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="fixed inset-[0] z-20 flex flex-col items-center justify-center gap-4 overflow-y-auto px-gutter-card py-8 text-center"
      style={{ ...TAKEOVER_SURFACE, opacity: 0, willChange: 'transform, opacity' }}
    >
      <TakeoverBolt />
      <h2 id={titleId} className="font-takeover-title text-takeover-title">
        {t('result.winTitle')}
      </h2>
      <p className="flex flex-col items-center gap-2">
        <VoltText testId="takeover-self-score" className="font-takeover-score text-takeover-score tabular-nums">
          {formatNumber(selfScore)}
        </VoltText>
        {opponent ? (
          <span data-testid="takeover-opponent" className="text-body tabular-nums text-on-band-muted">
            <Lang>{opponent.name}</Lang> {formatNumber(opponent.score)}
          </span>
        ) : null}
        {delta !== undefined && delta !== null ? (
          <VoltText testId="takeover-delta" className="rounded-full bg-band-raised px-3 py-1 text-body font-bold tabular-nums">
            {formatSigned(delta)}
          </VoltText>
        ) : null}
      </p>
      <button
        ref={continueRef}
        type="button"
        data-testid="takeover-continue"
        className="hit-target inline-flex min-h-target-min items-center justify-center px-4 text-caption text-on-band-muted underline"
      >
        {t('results.continue')}
      </button>
    </div>
  );
}
