import { useTranslation } from 'react-i18next';
import { useGuestSession, guestSession } from '../../auth/guestSession.ts';
import { BrandMark } from '../../design/BrandMark.tsx';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { navigate } from '../../shell/router.ts';
import { usePlayAvailability } from '../../shell/usePlayAvailability.ts';
import { LockedModeRows } from './LockedModeRows.tsx';
import { QuickMatchCard } from './QuickMatchCard.tsx';
import { SignInNudge } from './SignInNudge.tsx';

/**
 * Guest Home (Play tab; mockups/key-home.html, guest column): the Quick Match card, one Sign-in
 * nudge, then the locked mode rows. No rank snippet, no rating trio, no volt. If the guest token
 * can't be fetched, an inline alert says why with a Retry, and Quick Match stays aria-disabled.
 */
export function GuestHome() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.home'));
  const play = usePlayAvailability();
  const status = useGuestSession((s) => s.status);
  const reason = useGuestSession((s) => s.reason);

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
