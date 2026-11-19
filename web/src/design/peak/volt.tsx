import type { CSSProperties, ReactNode, Ref } from 'react';
import { colors } from '../tokens.ts';
import { BOLT_POINTS } from './BoltStrike.tsx';

/**
 * The volt pieces of the results surfaces (Story 1.10). Volt is reserved for band surfaces, so
 * it lives only here (`npm run check:tokens`); the results screen composes these.
 */

/** A volt chip with on-volt text (the win's rating change, UX-DR38): only ever inside a band surface. */
export function VoltChip({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <span data-testid={testId} data-accent="" className={['rounded-full bg-volt px-3 py-1 font-bold text-on-volt', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}

/** Text in volt: only ever inside a band surface. */
export function VoltText({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <span data-testid={testId} data-accent="" className={['text-volt', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}

/**
 * A compact peak band (DESIGN.md › Results band). `volt` gives it the 1px volt edge in dark mode
 * (the win band); the loss and draw bands have no volt at all.
 */
export function PeakBandSurface({
  volt,
  children,
  testId,
  result,
}: {
  volt: boolean;
  children: ReactNode;
  testId?: string;
  result?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-result={result}
      className={[
        'surface-band relative overflow-hidden rounded-xl border border-band px-4 py-4',
        volt ? 'dark:border-volt' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

/**
 * The full-screen win takeover keeps the light band colour in both themes (DESIGN.md › Colors),
 * so it is set from the tokens rather than the dark-swapped `surface-band`.
 */
export const TAKEOVER_SURFACE: CSSProperties = { backgroundColor: colors.band, color: colors['on-band'] };

/** The takeover's large volt bolt: one hard-edged polygon, shown with the flood (no extra strike). */
export function TakeoverBolt({ ref }: { ref?: Ref<SVGSVGElement> }) {
  return (
    <svg
      ref={ref}
      data-testid="takeover-bolt"
      data-accent=""
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 150"
      width={120}
      height={150}
      className="pointer-events-none text-volt"
    >
      <polygon points={BOLT_POINTS} fill="currentColor" />
    </svg>
  );
}
