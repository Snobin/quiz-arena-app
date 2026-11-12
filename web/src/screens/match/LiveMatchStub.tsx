import { useTranslation } from 'react-i18next';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { useLiveGame } from '../../realtime/liveGameStore.ts';
import { Link } from '../../shell/Link.tsx';
import { searchParam } from '../../shell/router.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';
import { OpponentNames } from './opponents.tsx';

const HOME_LINK = 'hit-target inline-flex min-h-target-min items-center text-body underline';

/**
 * `/match` stub (Story 1.6): "Match found · vs <name>" with the BOT badge for a bot, and a Home
 * link. Story 1.8 replaces it with the live match screen. No tab bar.
 */
export function LiveMatchStub() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.match'));
  useHideTabBar();
  const stored = useLiveGame((s) => s.match);
  // "Back to your match" names the match: a different one in the store (or none) is not shown.
  const wanted = searchParam('matchId');
  const match = stored && (wanted === null || wanted === stored.matchId) ? stored : null;

  return (
    <PageColumn className="justify-center py-6">
      <main className="flex flex-col items-start gap-3">
        {match ? (
          <>
            <h1 tabIndex={-1} className="flex flex-wrap items-center gap-2 font-title text-title">
              <span>{t('match.foundVs')}</span> <OpponentNames match={match} />
            </h1>
            <p>{t('match.stubNote')}</p>
          </>
        ) : (
          <>
            <h1 tabIndex={-1} className="font-title text-title">
              {t('title.match')}
            </h1>
            <p>{t('match.none')}</p>
          </>
        )}
        <Link to="/" className={HOME_LINK}>
          {t('common.home')}
        </Link>
      </main>
    </PageColumn>
  );
}
