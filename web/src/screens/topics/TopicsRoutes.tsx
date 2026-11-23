import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { liveGameStore, useLiveGame } from '../../realtime/liveGameStore.ts';
import { MatchmakingScreen } from '../matchmaking/MatchmakingScreen.tsx';
import { navigate, usePathname } from '../../shell/router.ts';
import { signInPath } from '../home/signInPath.ts';
import { TOPICS_QUERY_KEY, TopicPicker, type TopicPurpose } from './TopicPicker.tsx';
import { fetchTopics } from './topicsApi.ts';
import PracticeScreen from '../practice/PracticeScreen.tsx';
import { PRACTICE_PICKER } from '../practice/PracticeSummary.tsx';

/** Where the picker sends a selection: the Topic Duel matchmaking view (Story 4.2); Solo Practice opens the practice screen (Story 4.3). */
export const DUEL_PATH = '/play/duel/';
export const PRACTICE_PATH = '/practice/';
export const CUSTOM_PRACTICE_PATH = '/practice/custom/';

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

/** An empty, trailing-slash, extra-segment or non-UUID id never starts a session: back to the picker. */
function PracticeRoute({ id }: { id: string }) {
  const valid = UUID.test(id);
  useEffect(() => {
    if (!valid) navigate(PRACTICE_PICKER, { replace: true });
  }, [valid]);
  const target = useMemo(() => ({ kind: 'bank', topicId: id }) as const, [id]);
  return valid ? <PracticeScreen key={id} target={target} /> : <Pending />;
}

/** `/practice/custom/:customTopicId` (Story 6.4): the same guard, for one of her own topics. */
function CustomPracticeRoute({ id }: { id: string }) {
  const valid = UUID.test(id);
  useEffect(() => {
    if (!valid) navigate(PRACTICE_PICKER, { replace: true });
  }, [valid]);
  const target = useMemo(() => ({ kind: 'custom', customTopicId: id }) as const, [id]);
  return valid ? <PracticeScreen key={`custom:${id}`} target={target} /> : <Pending />;
}

/**
 * The lazy chunk behind /play/topics, Topic Duel and Solo Practice. A guest is sent to the Sign-in prompt
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
  if (pathname.startsWith(CUSTOM_PRACTICE_PATH)) return <CustomPracticeRoute id={pathname.slice(CUSTOM_PRACTICE_PATH.length)} />;
  if (pathname.startsWith(PRACTICE_PATH)) return <PracticeRoute id={pathname.slice(PRACTICE_PATH.length)} />;
  const params = new URLSearchParams(window.location.search);
  const target = params.get('for');
  const purpose: TopicPurpose = target === 'solo' ? 'SOLO_PRACTICE' : target === 'room' ? 'BATTLE_ROOM' : 'TOPIC_DUEL';
  return (
    <TopicPicker
      purpose={purpose}
      sources={purpose === 'SOLO_PRACTICE' || purpose === 'BATTLE_ROOM' ? ['BANK', 'CUSTOM'] : ['BANK']}
      onSelectCustom={(topic) => {
        if (purpose === 'BATTLE_ROOM') {
          // As a bank topic: back to Create, or into the host's configure (Story 6.5b).
          const roomId = params.get('roomId');
          const count = Number(params.get('count'));
          void import('../rooms/pickerReturn.ts')
            .then((m) => m.returnPickedCustomTopic(topic, { roomId, count: Number.isInteger(count) && count > 0 ? count : null }))
            .catch(() => navigate('/rooms', { replace: true }));
          return;
        }
        navigate(`${CUSTOM_PRACTICE_PATH}${topic.customTopicId}`);
      }}
      notice={params.get('notice') === 'small' ? t('topics.notice.small') : undefined}
      onSelect={(topic) => {
        if (purpose === 'BATTLE_ROOM') {
          // Back to the Create screen, or the host's lobby when `roomId` is set. The room code stays in its own chunk.
          const roomId = params.get('roomId');
          const count = Number(params.get('count'));
          void import('../rooms/pickerReturn.ts').then((m) => m.returnPickedTopic(topic, { roomId, count: Number.isInteger(count) && count > 0 ? count : null }))
            // The rooms chunk did not load (offline): the Rooms tab is the way on.
            .catch(() => navigate('/rooms', { replace: true }));
          return;
        }
        navigate(`${purpose === 'TOPIC_DUEL' ? DUEL_PATH : PRACTICE_PATH}${topic.topicId}`);
      }}
    />
  );
}
