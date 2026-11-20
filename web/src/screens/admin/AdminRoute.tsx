import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession, session } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { LiveRegions } from '../../shell/LiveRegions.tsx';
import { navigate } from '../../shell/router.ts';
import { signInPath } from '../home/signInPath.ts';
import { NotAuthorised } from './NotAuthorised.tsx';

// The only way into admin code: a dynamic import, evaluated only for an admin (check-dist enforces this).
const AdminApp = lazy(() => import('../../admin/AdminApp.tsx'));

function Pending() {
  const { t } = useTranslation();
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

/**
 * The route guard for /admin and /admin/*, in the player bundle. The role comes from the access token only. A guest goes
 * through sign-in and returns here; a signed-in player without ADMIN sees "Not authorised" and the admin chunk is never requested.
 */
export function AdminRoute() {
  const status = useSession((s) => s.status);
  const admin = status === 'registered' && session.isAdmin();
  useEffect(() => {
    if (status === 'guest') navigate(signInPath(`${window.location.pathname.replace(/^.*?(\/admin)/, '$1')}${window.location.search}`), { replace: true });
  }, [status]);

  if (status === 'booting' || status === 'guest') return <Pending />;
  if (!admin) {
    return (
      <>
        <LiveRegions />
        <NotAuthorised />
      </>
    );
  }
  return (
    <Suspense fallback={<Pending />}>
      <AdminApp />
    </Suspense>
  );
}
