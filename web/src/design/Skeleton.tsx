import { useTranslation } from 'react-i18next';
import { useReducedEffects } from '../motion/reduceEffects.ts';

/** One placeholder row: its height follows a type step (or a card), its width a percentage. */
export type SkeletonRow = {
  kind?: 'text' | 'title' | 'card';
  width?: `${number}%`;
};

const HEIGHTS: Record<NonNullable<SkeletonRow['kind']>, string> = {
  text: 'h-[1.5em]',
  title: 'h-[2em]',
  card: 'h-[5rem]',
};

/**
 * Loading placeholder shaped like the surface it stands in for (there is no spinner). The rows
 * are hidden from assistive tech; a non-live "loading" text names the busy state instead. The
 * shimmer is off whenever the reduced path is active.
 */
export function Skeleton({ rows, className }: { rows: readonly SkeletonRow[]; className?: string }) {
  const { t } = useTranslation();
  const reduced = useReducedEffects();
  return (
    <div aria-busy="true" className={['flex flex-col gap-3', className].filter(Boolean).join(' ')}>
      <span className="sr-only">{t('common.loading')}</span>
      {rows.map((row, index) => (
        <div
          key={index}
          aria-hidden="true"
          data-skeleton-row=""
          className={[
            'rounded-sm bg-hairline',
            HEIGHTS[row.kind ?? 'text'],
            reduced ? null : 'skeleton-shimmer',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ width: row.width ?? '100%' }}
        />
      ))}
    </div>
  );
}
