import type { Ref } from 'react';
import { motion } from '../tokens.ts';
import { animatePeak } from './animate.ts';

/**
 * The volt bolt (DESIGN.md › Brand & Style): one hard-edged polygon, volt on band only. It is
 * small by construction (BOLT_WIDTH × BOLT_HEIGHT CSS px), far under the 10% of the viewport a
 * flash may cover, and it never paints white.
 */
export const BOLT_WIDTH = 64;
export const BOLT_HEIGHT = 80;

/** The share of a viewport the bolt's box covers (an upper bound on the polygon's area). */
export function boltViewportFraction(viewportWidth: number, viewportHeight: number): number {
  return (BOLT_WIDTH * BOLT_HEIGHT) / (viewportWidth * viewportHeight);
}

/** Before its strike the bolt is hidden; `strike` runs it. Under the reduced path it is shown as is. */
export function BoltStrike({ ref, waitForStrike }: { ref?: Ref<SVGSVGElement>; waitForStrike: boolean }) {
  return (
    <svg
      ref={ref}
      data-testid="bolt"
      data-accent=""
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 150"
      width={BOLT_WIDTH}
      height={BOLT_HEIGHT}
      className="pointer-events-none absolute right-2 top-2 text-volt"
      style={{ opacity: waitForStrike ? 0 : 1, willChange: waitForStrike ? 'transform, opacity' : undefined }}
    >
      <polygon points="70,4 26,82 56,82 40,146 96,58 64,58 84,4" fill="currentColor" />
    </svg>
  );
}

/**
 * One strike: full volt for `motion.strikeVoltHold`, then it settles, all within
 * `motion.strikeTotal`. Opacity and transform only; nothing turns white.
 */
export function strike(bolt: SVGSVGElement): void {
  const total = motion.strikeTotal;
  const appear = 20 / total;
  const hold = appear + motion.strikeVoltHold / total;
  animatePeak(
    bolt,
    [
      { opacity: 0, transform: 'scale(1.12)', offset: 0 },
      { opacity: 1, transform: 'scale(1.12)', offset: appear },
      { opacity: 1, transform: 'scale(1.12)', offset: hold },
      { opacity: 0.6, transform: 'scale(1)', offset: 1 },
    ],
    { duration: total, easing: motion.easingDefault },
  );
}
