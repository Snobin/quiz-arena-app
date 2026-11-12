import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BotBadge } from '../../design/BotBadge.tsx';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { formatNumber } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { useLiveGame } from '../../realtime/liveGameStore.ts';
import { announce } from '../../shell/announce.ts';
import { navigate } from '../../shell/router.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';

/**
 * `/results`, minimal (Story 1.9; Story 1.10 replaces it): each participant's name and score from
 * the store's `outcome`, her own row marked, and Home. With no outcome (or an aborted match) it
 * goes Home. Every number is the server's, as last seen.
 */
export function ResultsScreen() {
  const { t } = useTranslation();
  useHideTabBar();
  useDocumentTitle(t('results.title'));
  const live = useLiveGame((s) => s.live);
  const outcome = live?.outcome ?? null;
  const show = live !== null && outcome !== null && outcome.kind !== 'aborted';

  useEffect(() => {
    if (show) return;
    // An abort that lands here (Leave before the first reveal): Home shows the notice.
    if (outcome?.kind === 'aborted') announce(t('match.aborted'));
    navigate('/', { replace: true });
  }, [show]);

  if (!show) return null;

  const names = new Map(live.participants.map((p) => [p.participantId, p]));
  return (
    <PageColumn className="py-6">
      <main className="flex flex-col gap-4">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('results.title')}
        </h1>
        {outcome.kind === 'forfeited' ? (
          <p data-testid="notice-forfeited" className="text-body text-muted">
            {t('match.forfeited')}
          </p>
        ) : null}
        <ol className="flex flex-col gap-2">
          {outcome.scores.map((row) => {
            const participant = names.get(row.participantId);
            const self = row.participantId === live.selfParticipantId;
            return (
              <li
                key={row.participantId}
                data-testid={self ? 'result-self' : 'result-row'}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-3 ${
                  self ? 'border-[1.5px] border-ink bg-card' : 'border border-hairline bg-card'
                }`}
              >
                <span className="inline-flex items-center gap-2 text-body">
                  {self ? (
                    <span className="font-bold text-ink">{t('match.you')}</span>
                  ) : (
                    <span className="text-ink">
                      <Lang>{participant?.displayName ?? ''}</Lang>
                    </span>
                  )}{' '}
                  {participant?.kind === 'BOT' ? <BotBadge /> : null}
                </span>
                <span className="font-score text-score tabular-nums text-ink">{formatNumber(row.score)}</span>
              </li>
            );
          })}
        </ol>
        <div>
          <Button onClick={() => navigate('/')}>{t('common.home')}</Button>
        </div>
      </main>
    </PageColumn>
  );
}
