import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { navigate, usePathname } from '../../shell/router.ts';
import { signInPath } from '../home/signInPath.ts';
import ImportScreen from './ImportScreen.tsx';

export const IMPORT_PATH = '/me/custom-topics/import';

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
 * `/me/custom-topics/…` (Story 6.2). Registered players only: a guest, on the route directly or from the Me tab, goes to the
 * Sign-in prompt and comes back here. Any other path under it returns to Me until Story 6.3 adds the topic list.
 */
export default function CustomTopicsRoutes() {
  const status = useSession((s) => s.status);
  const pathname = usePathname();
  const known = pathname === IMPORT_PATH;
  useEffect(() => {
    if (status === 'guest') navigate(signInPath(known ? pathname : IMPORT_PATH), { replace: true });
    else if (status === 'registered' && !known) navigate('/me', { replace: true });
  }, [status, known, pathname]);
  return status === 'registered' && known ? <ImportScreen /> : <Pending />;
}
