import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { Lang } from '../../i18n/Lang.tsx';
import { useProfile } from '../../profile/profileStore.ts';
import { BrandMark } from '../../design/BrandMark.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { navigate } from '../../shell/router.ts';
import { usePlayAvailability } from '../../shell/usePlayAvailability.ts';
import { RankSnippet } from '../../ranks/RankSnippet.tsx';
import { RatingTrio } from '../../ratings/RatingTrio.tsx';
import { ComingSoonModeRows } from './ComingSoonModeRows.tsx';
import { QuickMatchCard } from './QuickMatchCard.tsx';

/**
 * Home for a registered player (Story 2.1): the Quick Match card, then the other modes unlocked but
 * "Coming soon". No Sign-in nudge. The display name is inserted unchanged.
 */
export function RegisteredHome() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.home'));
  const play = usePlayAvailability();
  const name = useSession((s) => s.name);
  const complete = useProfile((s) => s.profile?.profileComplete ?? false);

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <BrandMark className="font-title text-title" />
        <h1 tabIndex={-1} className="font-title text-title">
          {name ? (
            <>
              {t('home.registeredHello')} <Lang>{name}</Lang>
            </>
          ) : (
            t('home.registeredHeaderNoName')
          )}
        </h1>
        <QuickMatchCard disabledReason={play.disabled ? play.reason : !complete ? t('home.quickMatch.needsProfile') : undefined} onPlay={() => navigate('/matchmaking')} />
        <RankSnippet />
        <RatingTrio />
        <ComingSoonModeRows />
      </main>
    </PageColumn>
  );
}
