import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../design/Button.tsx';
import { formatNumber } from '../i18n/format.ts';
import { SectionError } from '../ratings/RatingTrio.tsx';
import { navigate } from '../shell/router.ts';
import { boardKey, fetchBoard, PAGE } from './leaderboardApi.ts';
import { selectBoard } from './ranksSelection.ts';

/**
 * The Home rank snippet (UX-DR61, registered players only): her Quick Match daily rank as a 26px bold number with "in
 * Kerala today" and her day's gain; tapping it opens Ranks on Quick Match · Today. With no position today it reads
 * "Not on today's board yet" with "Play a Quick Match".
 */
export function RankSnippet() {
  const { t } = useTranslation();
  // The same query as the Ranks tab's first page, so the two share one request.
  const query = useQuery({ queryKey: boardKey(true, 'QUICK', 'daily', 0), queryFn: ({ signal }) => fetchBoard('QUICK', 'daily', 0, PAGE, signal), staleTime: 30_000, retry: false });

  if (query.isError) return <SectionError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <div data-testid="rank-snippet-loading" className="min-h-[4.5rem] rounded-lg border border-hairline bg-card" />;
  const me = query.data.me;
  if (!me) {
    return (
      <section data-testid="rank-snippet" className="flex flex-col items-start gap-2 rounded-lg border border-hairline bg-card p-4">
        <p className="text-body text-muted">{t('ranks.snippet.none')}</p>
        <Button variant="secondary" onClick={() => navigate('/matchmaking')}>
          {t('history.playNow')}
        </Button>
      </section>
    );
  }
  return (
    <button
      type="button"
      data-testid="rank-snippet"
      onClick={() => {
        selectBoard('QUICK', 'daily');
        navigate('/ranks');
      }}
      className="hit-target flex min-h-target-min w-full items-center justify-between gap-3 rounded-lg border border-hairline bg-card p-4 text-left"
    >
      <span className="flex items-baseline gap-2">
        <span data-testid="rank-snippet-rank" className="text-[26px] font-bold leading-none tabular-nums text-ink">
          {formatNumber(me.rank)}
        </span>
        <span className="text-caption text-muted">{t('ranks.snippet.caption')}</span>
      </span>
      <span data-testid="rank-snippet-gain" className="text-body font-semibold tabular-nums">
        {t('ranks.snippet.gain', { delta: me.value })}
      </span>
    </button>
  );
}
