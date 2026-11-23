import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../design/Button.tsx';
import { formatNumber, formatSigned } from '../i18n/format.ts';
import { uiLanguage, type MessageKey } from '../i18n/index.ts';
import { navigate } from '../shell/router.ts';
import { MODE_LABEL, SectionError } from './RatingTrio.tsx';
import { fetchMyMatches, type HistoryEntry } from './ratingsApi.ts';

const RESULT_LABEL: Record<HistoryEntry['result'], MessageKey> = {
  WIN: 'history.result.WIN',
  LOSS: 'history.result.LOSS',
  DRAW: 'history.result.DRAW',
};

export const MATCHES_QUERY_KEY = ['matches', 'me'] as const;

/** A match date in IST, display only, with Latin digits in both languages. */
export function formatMatchDate(endedAt: string, language: string): string {
  const locale = language === 'ml' ? 'ml-IN-u-nu-latn' : 'en-IN';
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(endedAt));
}

/**
 * The last 20 matches (FR8, UX-DR81): result, mode, date (IST) and the rating change, or a muted "unrated" for a null
 * delta. With none: one plain line and a primary action that starts a Quick Match. A failed load is an inline retry.
 */
export function MatchHistory() {
  const { t, i18n } = useTranslation();
  const query = useQuery({ queryKey: MATCHES_QUERY_KEY, queryFn: () => fetchMyMatches(20), retry: false });

  return (
    <section aria-labelledby="history-heading" data-testid="match-history" className="flex flex-col gap-2">
      <h2 id="history-heading" className="text-body font-bold">
        {t('history.title')}
      </h2>
      {query.isError ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : query.data.length === 0 ? (
        <div data-testid="history-empty" className="flex flex-col items-start gap-2">
          <p className="text-body">{t('history.empty')}</p>
          <Button onClick={() => navigate('/matchmaking')}>{t('history.playNow')}</Button>
        </div>
      ) : (
        <ol className="rounded-lg border border-hairline bg-card">
          {query.data.map((match) => (
            <li key={match.matchId} data-testid="history-row" className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2 last:border-b-0">
              <span className="flex flex-col">
                <span className="text-body font-semibold">{t(RESULT_LABEL[match.result])}</span>
                <span className="text-caption text-muted">
                  {t(MODE_LABEL[match.mode])}
                  {match.mode === 'BATTLE_ROOM' && match.ratingDelta === undefined ? ` · #${match.placement}` : ''} · {formatMatchDate(match.endedAt, uiLanguage(i18n))} · {formatNumber(match.score)}
                </span>
              </span>
              {match.ratingDelta === undefined ? (
                <span data-testid="history-unrated" className="text-caption text-muted">
                  {t('history.unrated')}
                </span>
              ) : (
                <span data-testid="history-delta" className="text-body font-semibold tabular-nums">
                  {formatSigned(match.ratingDelta)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
