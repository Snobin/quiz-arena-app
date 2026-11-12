import { useTranslation } from 'react-i18next';
import { Button } from '../design/Button.tsx';
import { PageColumn } from '../design/PageColumn.tsx';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { navigate } from '../shell/router.ts';
import { useHideTabBar } from '../shell/useHideTabBar.ts';

/** `/matchmaking` stub (Story 1.5): Story 1.6 replaces it with the real queue. No tab bar. */
export function MatchmakingStub() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.matchmaking'));
  useHideTabBar();
  return (
    <PageColumn className="justify-center py-6">
      <main className="flex flex-col items-start gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('matchmaking.searching')}
        </h1>
        <p>{t('matchmaking.stub')}</p>
        <Button variant="secondary" onClick={() => navigate('/')}>
          {t('common.cancel')}
        </Button>
      </main>
    </PageColumn>
  );
}
