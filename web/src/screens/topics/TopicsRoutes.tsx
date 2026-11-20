import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { Link } from '../../shell/Link.tsx';
import { navigate, usePathname } from '../../shell/router.ts';
import { signInPath } from '../home/signInPath.ts';
import { TOPICS_QUERY_KEY, TopicPicker, type TopicPurpose } from './TopicPicker.tsx';
import { fetchTopics } from './topicsApi.ts';

/** Where the picker sends a selection until Stories 4.2 and 4.3 replace the stubs. */
export const DUEL_PATH = '/play/duel/';
export const PRACTICE_PATH = '/practice/';

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

function Stub({ topicId, purpose }: { topicId: string; purpose: TopicPurpose }) {
  const { t } = useTranslation();
  const catalogue = useQuery({ queryKey: TOPICS_QUERY_KEY, queryFn: fetchTopics, staleTime: 5 * 60 * 1000, retry: false });
  const name = catalogue.data?.subjects.flatMap((s) => s.topics).find((topic) => topic.topicId === topicId)?.name;
  const mode = t(purpose === 'TOPIC_DUEL' ? 'mode.topicDuel.title' : 'mode.solo.title');
  useDocumentTitle(mode);
  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {name ?? mode}
        </h1>
        <p className="text-body">{t('topics.stub.unavailable')}</p>
        <Link to={`/play/topics?for=${purpose === 'TOPIC_DUEL' ? 'duel' : 'solo'}`} className="hit-target inline-flex min-h-target-min items-center text-body font-semibold underline">
          {t('common.back')}
        </Link>
      </main>
    </PageColumn>
  );
}

/**
 * The lazy chunk behind /play/topics and the Duel and Solo stubs. A guest is sent to the Sign-in prompt
 * with this route as `returnTo`; the picker code is never requested for a guest.
 */
export default function TopicsRoutes() {
  const status = useSession((s) => s.status);
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'guest') navigate(signInPath(`${pathname}${window.location.search}`), { replace: true });
  }, [status, pathname]);
  if (status !== 'registered') return <Pending />;

  if (pathname.startsWith(DUEL_PATH)) return <Stub topicId={pathname.slice(DUEL_PATH.length)} purpose="TOPIC_DUEL" />;
  if (pathname.startsWith(PRACTICE_PATH)) return <Stub topicId={pathname.slice(PRACTICE_PATH.length)} purpose="SOLO_PRACTICE" />;
  const purpose: TopicPurpose = new URLSearchParams(window.location.search).get('for') === 'solo' ? 'SOLO_PRACTICE' : 'TOPIC_DUEL';
  return (
    <TopicPicker
      purpose={purpose}
      onSelect={(topic) => navigate(`${purpose === 'TOPIC_DUEL' ? DUEL_PATH : PRACTICE_PATH}${topic.topicId}`)}
    />
  );
}
