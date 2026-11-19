import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../design/Button.tsx';
import { formatNumber } from '../i18n/format.ts';
import type { MessageKey } from '../i18n/index.ts';
import { fetchMyRatings, RatingsError, type Mode } from './ratingsApi.ts';

export const MODE_LABEL: Record<Mode, MessageKey> = {
  QUICK: 'play.quickMatch',
  TOPIC_DUEL: 'mode.topicDuel.title',
  BATTLE_ROOM: 'mode.battleRoom.title',
};

export const RATINGS_QUERY_KEY = ['ratings', 'me'] as const;

/** The inline reason and retry for a failed section; the rest of the page keeps working. */
export function SectionError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const reason = error instanceof RatingsError && error.reason === 'network' ? 'ratings.error.network' : 'ratings.error.server';
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-brick bg-card p-4">
      <p className="text-body">{t(reason)}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

/**
 * The rating trio (FR7, UX-DR24): three small read-only cards, one per mode, each the mode's label and her current
 * rating (Latin digits, grouped, tabular; 1200 for a mode never rated). Registered players only; guests never see it.
 */
export function RatingTrio() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: RATINGS_QUERY_KEY, queryFn: fetchMyRatings, retry: false });

  if (query.isError) return <SectionError error={query.error} onRetry={() => void query.refetch()} />;
  const ratings = query.data;
  return (
    <section aria-label={t('ratings.title')} data-testid="rating-trio" className="grid grid-cols-3 gap-2">
      {(['QUICK', 'TOPIC_DUEL', 'BATTLE_ROOM'] as const).map((mode) => {
        const rating = ratings?.find((r) => r.mode === mode)?.rating;
        return (
          <div key={mode} data-testid={`rating-${mode}`} className="flex min-h-[4rem] flex-col justify-between rounded-lg border border-hairline bg-card p-2">
            <span className="text-caption text-muted">{t(MODE_LABEL[mode])}</span>
            <span className="text-body font-bold tabular-nums text-ink">{rating === undefined ? <span aria-hidden="true" className="text-muted">–</span> : formatNumber(rating)}</span>
          </div>
        );
      })}
    </section>
  );
}
