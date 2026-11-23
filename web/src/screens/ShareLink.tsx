import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/session.ts';
import { PageColumn } from '../design/PageColumn.tsx';
import { navigate } from '../shell/router.ts';

/**
 * `/q` (Story 7.1): the link on a shared result card. No landing page, prompt or confirmation: once the session is known
 * she goes straight to Quick Match matchmaking, which joins on mount and handles a player already in a queue, room or
 * match, a draining server and a missing guest token. A registered player whose profile is not set up never gets here
 * first: the shell shows setup and returns to this route. Offline she lands on Home, whose banner says so. The link never
 * pairs her with whoever shared it.
 */
export default function ShareLink() {
  const { t } = useTranslation();
  const status = useSession((s) => s.status);
  useEffect(() => {
    if (status === 'booting') return;
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    navigate(online ? '/matchmaking' : '/', { replace: true });
  }, [status]);
  return (
    <PageColumn className="py-4">
      <main>
        <h1 tabIndex={-1} className="sr-only">
          {t('common.loading')}
        </h1>
      </main>
    </PageColumn>
  );
}
