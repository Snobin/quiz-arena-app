import { useTranslation } from 'react-i18next';
import { Lang } from '../i18n/Lang.tsx';
import { formatNumber } from '../i18n/format.ts';
import { formatValue, useDistrictName } from './RankRow.tsx';

/**
 * Her own position when it is out of view (UX-DR60): pinned above the tab bar on a paper strip after a dim "···" gap
 * mark, in ink fill (band-dark in dark mode) with white rank, name and value, the district muted and a "You" outline
 * tag beside her unchanged name. Min height 56.
 */
export function PinnedRow({ rank, value, gained, name, district }: { rank: number; value: number; gained: boolean; name: string; district: string }) {
  const { t } = useTranslation();
  const districtName = useDistrictName(district);
  return (
    <div data-testid="pinned-row" className="fixed inset-x-[0] bottom-[var(--fixed-bar-height)] z-10 bg-paper pb-1">
      <div className="mx-auto w-full max-w-[480px] px-gutter-card">
        <p aria-hidden="true" className="text-center leading-none text-muted">
          ···
        </p>
        <div
          aria-label={t('ranks.row.a11y', { rank, name, district: districtName, value: formatValue(value, gained) })}
          className="surface-band flex min-h-[56px] items-center gap-3 rounded-lg px-3 py-2"
        >
          <span aria-hidden="true" className="w-8 flex-none text-center font-bold tabular-nums text-on-band">
            {formatNumber(rank)}
          </span>
          <span aria-hidden="true" className="flex min-w-[0] flex-1 flex-col">
            <span className="flex items-center gap-2 text-body font-semibold text-on-band">
              <Lang>{name}</Lang>
              <span data-testid="own-tag" className="rounded-sm border border-on-band px-1 text-caption font-semibold">
                {t('ranks.you')}
              </span>
            </span>
            {districtName ? <span className="text-caption text-on-band-muted">{districtName}</span> : null}
          </span>
          <span aria-hidden="true" className="flex-none font-score text-score tabular-nums text-on-band">
            {formatValue(value, gained)}
          </span>
        </div>
      </div>
    </div>
  );
}
