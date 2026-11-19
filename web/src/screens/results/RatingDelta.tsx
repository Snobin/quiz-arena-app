import { useTranslation } from 'react-i18next';
import { VoltChip } from '../../design/peak/volt.tsx';
import { formatSigned } from '../../i18n/format.ts';
import type { DeltaState } from '../../ratings/useMatchDelta.ts';
import type { ResultKind } from './outcome.ts';

/**
 * The rating-change slot of the compact results band (UX-DR38, UX-DR40). It is only mounted for a registered
 * player's own rated match, and keeps its height from the first paint so nothing shifts: a muted placeholder while
 * the match is processed, "updating" after 10 s, then the change. A win is a volt chip with on-volt text; a loss or
 * draw is a grey delta. A guest's results and a match known to be unrated do not mount the slot at all.
 */
export function RatingDelta({ state, kind }: { state: DeltaState; kind: ResultKind }) {
  const { t } = useTranslation();
  if (state.status === 'hidden') return null;
  // `unrated` keeps the (now empty) slot, so the band does not reflow when the answer turns out to be "not rated".
  return (
    <div data-testid="rating-delta-slot" className="mt-2 flex min-h-[1.75rem] items-center">
      {state.status === 'unrated' ? null : state.status === 'waiting' ? (
        <span data-testid="rating-delta-waiting" aria-hidden="true" className="text-body tabular-nums text-on-band-muted opacity-40">
          +00
        </span>
      ) : state.status === 'updating' ? (
        <span data-testid="rating-delta-updating" className="text-caption text-on-band-muted">
          {t('results.ratingUpdating')}
        </span>
      ) : kind === 'win' ? (
        <VoltChip testId="rating-delta" className="text-body tabular-nums">
          {formatSigned(state.delta)}
        </VoltChip>
      ) : (
        <span data-testid="rating-delta" className="text-body font-semibold tabular-nums text-on-band-muted">
          {formatSigned(state.delta)}
        </span>
      )}
    </div>
  );
}
