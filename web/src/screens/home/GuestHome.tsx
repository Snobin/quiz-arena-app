import { useTranslation } from 'react-i18next';
import { useGuestSession, guestSession } from '../../auth/guestSession.ts';
import { BrandMark } from '../../design/BrandMark.tsx';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { useLiveGame } from '../../realtime/liveGameStore.ts';
import { navigate } from '../../shell/router.ts';
import { usePlayAvailability } from '../../shell/usePlayAvailability.ts';
import { SessionEndedNote } from './SessionEndedNote.tsx';
import { LockedModeRows } from './LockedModeRows.tsx';
import { QuickMatchCard } from './QuickMatchCard.tsx';
import { SignInNudge } from './SignInNudge.tsx';

/**
 * Guest Home (Play tab; mockups/key-home.html, guest column): the Quick Match card, one Sign-in
 * nudge, then the locked mode rows. No rank snippet, no rating trio, no volt. If the guest token
 * can't be fetched, an inline alert says why with a Retry, and Quick Match stays aria-disabled.
 * After an aborted match it shows the one-line aborted notice.
 */
export function GuestHome() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.home'));
  const play = usePlayAvailability();
  const status = useGuestSession((s) => s.status);
  const reason = useGuestSession((s) => s.reason);
  // A match that was called off (Story 1.9) brings her here with a one-line notice, until the next search.
  const aborted = useLiveGame((s) => s.live?.outcome?.kind === 'aborted');

  const disabledReason = play.disabled
    ? play.reason
    : status !== 'ready'
      ? t('home.quickMatch.needsSession')
      : undefined;

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <BrandMark className="font-title text-title" />
        <h1 tabIndex={-1} className="font-title text-title">
          {t('home.guestHeader')}
        </h1>
        <SessionEndedNote />
        {aborted ? (
          <p data-testid="notice-aborted" className="text-body text-muted">
            {t('match.aborted')}
          </p>
        ) : null}
        {status === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-brick bg-card p-4">
            <p className="text-body">{t(reason === 'network' ? 'guest.error.network' : 'guest.error.server')}</p>
            <Button variant="secondary" onClick={() => void guestSession.retry()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : null}
        <QuickMatchCard disabledReason={disabledReason} onPlay={() => navigate('/matchmaking')} />
        <SignInNudge />
        <LockedModeRows />
      </main>
    </PageColumn>
  );
}
