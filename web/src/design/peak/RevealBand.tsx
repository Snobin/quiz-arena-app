import { useEffect, useRef, type ReactNode } from 'react';
import type { Language } from '../../i18n/language.ts';
import { requestFlash } from '../../motion/flashScheduler.ts';
import { monitorBandDrop } from '../../motion/reduceEffects.ts';
import { motion } from '../tokens.ts';
import { animatePeak } from './animate.ts';
import { BoltStrike, strike } from './BoltStrike.tsx';

export type RevealBandProps = {
  /** Restarts the peak when it changes (one per revealed question). */
  revealKey: string;
  correct: boolean;
  reduced: boolean;
  /** The muted label line (e.g. "ചോദ്യം 4 · ശരി" or "ശരിയുത്തരം"). */
  label: string;
  /** The correct answer, in peak-word type. */
  answer: string;
  answerLang: Language;
  /** Correct only: the points as sent, already formatted ("+800"). */
  points?: string;
  /** The total line ("ആകെ 3,140"). */
  total: string;
  /** Wrong / no answer only: the voice line naming the answer. */
  wrongLine?: ReactNode;
};

/**
 * The reveal peak band (DESIGN.md › Peak band, EXPERIENCE.md › Reveal). It drops in from the
 * top (`motion.bandDrop`, transform only); when the player was correct, one volt bolt strike
 * follows. Both go through the app-wide flash scheduler and are cancelled on unmount or a new
 * reveal. The first drop of the session is measured by `monitorBandDrop` (jank fallback).
 * Under the reduced path the band is a plain `motion.reducedFade` opacity fade: no drop, no
 * strike. Wrong or no answer: the same band with no bolt and no volt.
 * Give it `key={revealKey}` too, so each reveal starts from a fresh (hidden) element.
 */
export function RevealBand(props: RevealBandProps) {
  const { revealKey, correct, reduced, label, answer, answerLang, points, total, wrongLine } = props;
  const bandRef = useRef<HTMLDivElement>(null);
  const boltRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const band = bandRef.current;
    if (!band) return;
    const cancels: Array<() => void> = [];
    let stopMonitor: (() => void) | undefined;
    let monitorTimer: ReturnType<typeof setTimeout> | undefined;

    if (reduced) {
      cancels.push(
        requestFlash(() => {
          animatePeak(band, [{ opacity: 0 }, { opacity: 1 }], { duration: motion.reducedFade, easing: motion.easingDefault });
        }),
      );
    } else {
      cancels.push(
        requestFlash(() => {
          stopMonitor = monitorBandDrop();
          monitorTimer = setTimeout(() => stopMonitor?.(), motion.bandDrop);
          band.style.opacity = '1';
          animatePeak(band, [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }], {
            duration: motion.bandDrop,
            easing: motion.easingDefault,
          });
        }),
      );
      if (correct) {
        cancels.push(
          requestFlash(() => {
            if (boltRef.current) strike(boltRef.current);
          }),
        );
      }
    }
    return () => {
      for (const cancel of cancels) cancel();
      if (monitorTimer !== undefined) clearTimeout(monitorTimer);
      stopMonitor?.();
    };
    // One peak per reveal.
  }, [revealKey]);

  return (
    <div
      ref={bandRef}
      data-testid="reveal-band"
      data-correct={correct ? 'true' : 'false'}
      className="surface-band relative overflow-hidden rounded-xl border border-band px-4 py-4 dark:border-volt"
      style={{ opacity: 0, willChange: 'transform, opacity' }}
    >
      {correct ? <BoltStrike ref={boltRef} waitForStrike={!reduced} /> : null}
      <p className="pr-[72px] text-label text-on-band-muted">{label}</p>
      <p lang={answerLang} className="pr-[72px] font-peak-word text-peak-word text-on-band">
        {answer}
      </p>
      {correct ? (
        <p className="mt-2 flex flex-wrap items-baseline gap-2">
          <span data-testid="band-points" data-accent="" className="font-peak-points text-peak-points tabular-nums text-volt">
            {points}
          </span>
          <span data-testid="band-total" className="text-label tabular-nums text-on-band-muted">
            {total}
          </span>
        </p>
      ) : (
        <>
          {wrongLine ? <p className="mt-1 text-body text-on-band-soft">{wrongLine}</p> : null}
          <p data-testid="band-total" className="mt-1 text-label tabular-nums text-on-band-muted">
            {total}
          </p>
        </>
      )}
    </div>
  );
}
