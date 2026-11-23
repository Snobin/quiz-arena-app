import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { useOnline } from '../../shell/online.ts';
import { navigate, searchParam } from '../../shell/router.ts';
import { DeleteDialog } from './DeleteDialog.tsx';
import '../rooms/roomCatalogue.ts';
import { MAX_QUESTIONS, MIN_QUESTIONS } from '../rooms/roomConfig.ts';
import './importCatalogue.ts';
import { deleteTopic, fetchTopic, fetchTopicList, ManageError, TOPIC_LIST_KEY, topicKey, type TopicQuestion } from './manageApi.ts';
import { SuccessCard } from './SuccessCard.tsx';
import { LIST_PATH, IMPORT_PATH, LoadError, Skeleton } from './TopicListScreen.tsx';
import { scriptLang, shortDate } from './topicFormat.ts';
import { UsageMeter } from './UsageMeter.tsx';

const PAGE = 50;
const LETTERS = ['A', 'B', 'C', 'D'] as const;

function QuestionCard({ q }: { q: TopicQuestion }) {
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-hairline bg-card p-4">
      <p className="text-caption font-semibold text-muted">{t('manage.q.number', { n: q.position })}</p>
      <p lang={q.lang} className="break-words font-question text-question text-ink">
        {q.text}
      </p>
      <ol className="flex flex-col gap-1">
        {q.options.map((option, i) => {
          const correct = i === q.answerIndex;
          return (
            <li key={i} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={`flex h-[24px] w-[24px] flex-none items-center justify-center rounded-sm text-caption ${correct ? 'bg-band text-on-band' : 'bg-tile text-muted'}`}
              >
                {correct ? '✓' : LETTERS[i]}
              </span>
              <span lang={q.lang} className={`min-w-[0] break-words font-option text-option ${correct ? 'font-bold text-ink' : 'text-ink'}`}>
                {option}
                {correct ? <span className="sr-only">{` (${t('manage.q.correct')})`}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p lang={q.lang} className="break-words font-explanation text-explanation text-muted">
        {q.explanation}
      </p>
    </li>
  );
}

/** `/me/custom-topics/{id}` (Story 6.3): the topic's questions and its actions: Practice (Story 6.4), Re-import and Delete (Battle Room arrives with 6.5). */
export default function TopicViewScreen({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const queryClient = useQueryClient();
  const topic = useQuery({ queryKey: topicKey(id), queryFn: () => fetchTopic(id), retry: false });
  const list = useQuery({ queryKey: TOPIC_LIST_KEY, queryFn: fetchTopicList, retry: false });
  const [shown, setShown] = useState(PAGE);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const imported = searchParam('imported') === '1';
  useDocumentTitle(topic.data?.name ?? t('manage.title'));

  const gone = topic.error instanceof ManageError && topic.error.status === 404;
  useEffect(() => {
    if (gone) navigate(LIST_PATH, { replace: true });
  }, [gone]);

  const remove = useMutation({
    mutationFn: () => deleteTopic(id),
    onSettled: (_data, error) => {
      const name = topic.data?.name ?? '';
      if (!error || (error instanceof ManageError && error.status === 404)) {
        void queryClient.invalidateQueries({ queryKey: TOPIC_LIST_KEY });
        queryClient.removeQueries({ queryKey: topicKey(id) });
        navigate(`${LIST_PATH}${error ? '' : `?deleted=${encodeURIComponent(name)}`}`, { replace: true });
      } else {
        setAsking(false);
        setFailed(error instanceof ManageError && error.detail ? error.detail : t('import.note.server'));
      }
    },
  });

  const data = topic.data;
  const Heading = imported ? 'h2' : 'h1';
  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        {topic.isPending ? <Skeleton /> : null}
        {topic.isError && !data && !gone ? <LoadError error={topic.error} onRetry={() => void topic.refetch()} /> : null}
        {data ? (
          <>
            {imported ? <SuccessCard name={data.name} count={data.questionCount} onAnother={() => navigate(IMPORT_PATH)} /> : null}
            <header className="flex flex-col gap-1">
              <Heading tabIndex={-1} lang={scriptLang(data.name)} className="break-words font-title text-title">
                {data.name}
              </Heading>
              <p className="text-caption text-muted">{t('manage.view.sub', { count: data.questionCount, date: shortDate(data.updatedAt, i18n.language) })}</p>
            </header>
            {!imported && list.data ? <UsageMeter usage={list.data.usage} /> : null}
            {failed ? (
              <p role="alert" className="rounded-lg border border-brick bg-card p-3 text-body text-brick">
                {failed}
              </p>
            ) : null}
            <div className="grid grid-cols-[2fr_1fr] gap-2">
              {online && data.questionCount >= MIN_QUESTIONS ? (
                <Button
                  variant="primary"
                  onClick={() => navigate(`/rooms/create?customTopicId=${encodeURIComponent(id)}&count=${Math.min(MAX_QUESTIONS, data.questionCount)}`)}
                >
                  {t('import.success.battle')}
                </Button>
              ) : (
                <Button variant="primary" disabled disabledReason={t(online ? 'rooms.mine.tooSmall' : 'manage.offline')}>
                  {t('import.success.battle')}
                </Button>
              )}
              {online ? (
                <Button variant="secondary" onClick={() => navigate(`/practice/custom/${id}`)}>
                  {t('import.success.practice')}
                </Button>
              ) : (
                <Button variant="secondary" disabled disabledReason={t('manage.offline')}>
                  {t('import.success.practice')}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {online ? (
                <Button variant="secondary" onClick={() => navigate(`${LIST_PATH}/${id}/reimport`)}>
                  {t('manage.view.reimport')}
                </Button>
              ) : (
                <Button variant="secondary" disabled disabledReason={t('manage.offline')}>
                  {t('manage.view.reimport')}
                </Button>
              )}
              {online ? (
                <Button variant="danger-text" onClick={() => setAsking(true)}>
                  {t('manage.view.delete')}
                </Button>
              ) : (
                <Button variant="danger-text" disabled disabledReason={t('manage.offline')}>
                  {t('manage.view.delete')}
                </Button>
              )}
            </div>
            <ol className="flex flex-col gap-3">
              {data.questions.slice(0, shown).map((q) => (
                <QuestionCard key={q.position} q={q} />
              ))}
            </ol>
            {data.questions.length > shown ? (
              <Button variant="secondary" className="self-start" onClick={() => setShown((n) => n + PAGE)}>
                {t('manage.q.more')}
              </Button>
            ) : null}
          </>
        ) : null}
      </main>
      {asking && data ? (
        <DeleteDialog topic={data.name} count={data.questionCount} busy={remove.isPending} onCancel={() => setAsking(false)} onConfirm={() => remove.mutate()} />
      ) : null}
    </PageColumn>
  );
}
