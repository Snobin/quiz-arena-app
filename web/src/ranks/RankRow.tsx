import { useTranslation } from 'react-i18next';
import { Lang } from '../i18n/Lang.tsx';
import { formatNumber, formatSigned } from '../i18n/format.ts';
import { districtKey, DISTRICT_CODES, type DistrictCode } from '../profile/districts.ts';
import type { BoardEntry } from './leaderboardApi.ts';

/** The district's display name in the UI language, or nothing for a player with no directory row yet. */
export function useDistrictName(code: string): string {
  const { t } = useTranslation();
  return (DISTRICT_CODES as readonly string[]).includes(code) ? t(districtKey(code as DistrictCode)) : '';
}

/** A board value as shown: "+142" for a gain, "1,912" for a rating. */
export const formatValue = (value: number, gained: boolean): string => (gained ? formatSigned(value) : formatNumber(value));

type Props = {
  entry: BoardEntry;
  gained: boolean;
  /** Her own row: the "You" tag and an ink outline. */
  own?: boolean;
  rowRef?: (element: HTMLLIElement | null) => void;
};

/**
 * One board row (UX-DR57, UX-DR58): a card with the rank (muted; ranks 1 to 3 in bold ink numerals, no medals, no
 * volt), the unchanged display name with the district below in a muted caption, and the value on the right in score
 * type. Its accessible name reads rank, name, district and value in that order.
 */
export function RankRow({ entry, gained, own, rowRef }: Props) {
  const { t } = useTranslation();
  const district = useDistrictName(entry.district);
  const value = formatValue(entry.value, gained);
  const top = entry.rank <= 3;
  return (
    <li
      ref={rowRef}
      data-testid="rank-row"
      data-own={own ? 'true' : undefined}
      aria-label={t('ranks.row.a11y', { rank: entry.rank, name: entry.displayName, district, value })}
      className={`flex min-h-[47px] items-center gap-3 rounded-lg bg-card px-3 py-2 ${own ? 'border-[1.5px] border-ink' : 'border border-hairline'}`}
    >
      <span aria-hidden="true" className={`w-8 flex-none text-center tabular-nums ${top ? 'font-bold text-ink' : 'text-muted'}`}>
        {formatNumber(entry.rank)}
      </span>
      <span aria-hidden="true" className="flex min-w-[0] flex-1 flex-col">
        <span className="flex items-center gap-2 text-body font-semibold">
          <Lang>{entry.displayName}</Lang>
          {own ? (
            <span data-testid="own-tag" className="rounded-sm border border-ink px-1 text-caption font-semibold">
              {t('ranks.you')}
            </span>
          ) : null}
        </span>
        {district ? <span className="text-caption text-muted">{district}</span> : null}
      </span>
      <span aria-hidden="true" className="flex-none font-score text-score tabular-nums text-ink">
        {value}
      </span>
    </li>
  );
}
