import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { liveGameStore, useLiveGame } from '../../realtime/liveGameStore.ts';
import { MatchmakingScreen } from '../matchmaking/MatchmakingScreen.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { Link } from '../../shell/Link.tsx';
import { navigate, usePathname } from '../../shell/router.ts';
import { signInPath } from '../home/signInPath.ts';
import { TOPICS_QUERY_KEY, TopicPicker, type TopicPurpose } from './TopicPicker.tsx';
import { fetchTopics } from './topicsApi.ts';

/** Where the picker sends a selection: the Topic Duel matchmaking view (Story 4.2); Solo Practice is still a stub (Story 4.3). */
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

const DUEL_PICKER = '/play/topics?for=duel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An empty, trailing-slash, extra-segment or non-UUID id never reaches the queue: back to the picker. */
function DuelRoute({ id }: { id: string }) {
  const valid = UUID.test(id);
  useEffect(() => {
    if (!valid) navigate(DUEL_PICKER, { replace: true });
  }, [valid]);
  return valid ? <Duel topicId={id} /> : <Pending />;
}

function useTopicName(topicId: string): string | undefined {
  const catalogue = useQuery({ queryKey: TOPICS_QUERY_KEY, queryFn: fetchTopics, staleTime: 5 * 60 * 1000, retry: false });
  return catalogue.data?.subjects.flatMap((s) => s.topics).find((topic) => topic.topicId === topicId)?.name;
}

/**
 * `/play/duel/:topicId` (Story 4.2): the Story 1.6 matchmaking screen on the topic's queue, with the topic name under
 * "Finding an opponent…". Cancel returns to the picker. When core says the topic has too few questions now
 * (TOPIC_UNAVAILABLE) the picker reopens with a notice and a fresh catalogue, so a raw 422 is never shown.
 */
function Duel({ topicId }: { topicId: string }) {
  const queryClient = useQueryClient();
  const name = useTopicName(topicId);
  const problem = useLiveGame((s) => s.problem);
  useEffect(() => {
    // Read at effect time: a problem left by an earlier visit is cleared by this mount's join first.
    if (liveGameStore.getState().problem?.kind !== 'topicUnavailable') return;
    void queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
    navigate(`${DUEL_PICKER}&notice=small`, { replace: true });
  }, [problem, queryClient]);
  return <MatchmakingScreen key={topicId} topicId={topicId} topicName={name} exitTo={DUEL_PICKER} />;
}

function Stub({ topicId, purpose }: { topicId: string; purpose: TopicPurpose }) {
  const { t } = useTranslation();
  const name = useTopicName(topicId);
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
  const { t } = useTranslation();
  const status = useSession((s) => s.status);
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'guest') navigate(signInPath(`${pathname}${window.location.search}`), { replace: true });
  }, [status, pathname]);
  if (status !== 'registered') return <Pending />;

  if (pathname.startsWith(DUEL_PATH)) return <DuelRoute id={pathname.slice(DUEL_PATH.length)} />;
  if (pathname.startsWith(PRACTICE_PATH)) return <Stub topicId={pathname.slice(PRACTICE_PATH.length)} purpose="SOLO_PRACTICE" />;
  const params = new URLSearchParams(window.location.search);
  const purpose: TopicPurpose = params.get('for') === 'solo' ? 'SOLO_PRACTICE' : 'TOPIC_DUEL';
  return (
    <TopicPicker
      purpose={purpose}
      notice={params.get('notice') === 'small' ? t('topics.notice.small') : undefined}
      onSelect={(topic) => navigate(`${purpose === 'TOPIC_DUEL' ? DUEL_PATH : PRACTICE_PATH}${topic.topicId}`)}
    />
  );
}
