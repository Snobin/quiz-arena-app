import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { navigate, usePathname } from '../../shell/router.ts';
import { signInPath } from '../home/signInPath.ts';
import ImportScreen from './ImportScreen.tsx';
import TopicListScreen, { IMPORT_PATH, LIST_PATH } from './TopicListScreen.tsx';
import TopicViewScreen from './TopicViewScreen.tsx';

export { IMPORT_PATH, LIST_PATH };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const VIEW = new RegExp(`^${LIST_PATH}/(${UUID})$`, 'i');
const REIMPORT = new RegExp(`^${LIST_PATH}/(${UUID})/reimport$`, 'i');

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
 * `/me/custom-topics/…` (Stories 6.2 and 6.3): the list, Import, a topic's view and its re-import. Registered players only: a guest,
 * on any of these routes, goes to the Sign-in prompt and comes back to it. An unknown path under it returns to the list.
 */
export default function CustomTopicsRoutes() {
  const status = useSession((s) => s.status);
  const pathname = usePathname();
  const view = VIEW.exec(pathname)?.[1];
  const reimport = REIMPORT.exec(pathname)?.[1];
  const known = pathname === LIST_PATH || pathname === IMPORT_PATH || Boolean(view) || Boolean(reimport);
  useEffect(() => {
    if (status === 'guest') navigate(signInPath(known ? pathname : LIST_PATH), { replace: true });
    else if (status === 'registered' && !known) navigate(LIST_PATH, { replace: true });
  }, [status, known, pathname]);
  if (status !== 'registered' || !known) return <Pending />;
  if (pathname === IMPORT_PATH) return <ImportScreen />;
  if (reimport) return <ImportScreen key={reimport} topicId={reimport} />;
  if (view) return <TopicViewScreen key={view} id={view} />;
  return <TopicListScreen />;
}
