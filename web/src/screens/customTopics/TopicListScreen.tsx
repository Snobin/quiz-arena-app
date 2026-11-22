import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { announce } from '../../shell/announce.ts';
import { Link } from '../../shell/Link.tsx';
import { useOnline } from '../../shell/online.ts';
import { navigate, searchParam } from '../../shell/router.ts';
import { Disclosures } from './Disclosures.tsx';
import './importCatalogue.ts';
import { fetchTopicList, ManageError, TOPIC_LIST_KEY } from './manageApi.ts';
import { scriptLang, shortDate } from './topicFormat.ts';
import { UsageMeter } from './UsageMeter.tsx';

export const IMPORT_PATH = '/me/custom-topics/import';
export const LIST_PATH = '/me/custom-topics';

export function Skeleton() {
  return (
    <div aria-hidden="true" data-testid="skeleton" className="flex flex-col gap-2">
      {[0, 1, 2].map((n) => (
        <div key={n} className="min-h-[56px] rounded-lg bg-tile" />
      ))}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const detail = error instanceof ManageError ? error.detail : null;
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-brick bg-card p-4">
      <p className="text-body text-brick">{[t('manage.loadError'), detail].filter(Boolean).join(' ')}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

/** `/me/custom-topics` (Story 6.3): the player's private topics with the usage meter, or the empty state. */
export default function TopicListScreen() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('manage.title'));
  const online = useOnline();
  const list = useQuery({ queryKey: TOPIC_LIST_KEY, queryFn: fetchTopicList, retry: false });
  const [open, setOpen] = useState({ schema: true, prompt: true });
  const deleted = searchParam('deleted');

  useEffect(() => {
    if (deleted) announce(t('manage.deleted', { topic: deleted }));
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = list.data;
  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('manage.title')}
        </h1>
        {deleted ? <p className="rounded-lg border border-hairline bg-card p-3 text-body text-ink">{t('manage.deleted', { topic: deleted })}</p> : null}

        {list.isPending ? <Skeleton /> : null}
        {list.isError && !data ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}

        {data ? (
          <>
            <UsageMeter usage={data.usage} />
            {online ? (
              <Button variant="primary" onClick={() => navigate(IMPORT_PATH)}>
                {t('manage.importButton')}
              </Button>
            ) : (
              <Button variant="primary" disabled disabledReason={t('manage.offline')}>
                {t('manage.importButton')}
              </Button>
            )}
            {data.topics.length === 0 ? (
              <>
                <p className="text-body text-muted">{t('manage.empty')}</p>
                <Disclosures
                  schemaOpen={open.schema}
                  promptOpen={open.prompt}
                  topicName=""
                  onToggle={(which) => setOpen((o) => ({ ...o, [which]: !o[which] }))}
                />
              </>
            ) : (
              <>
                <p className="text-caption font-semibold text-muted">{t('manage.private')}</p>
                <ul className="rounded-lg border border-hairline bg-card">
                  {data.topics.map((topic) => {
                    const date = shortDate(topic.updatedAt, i18n.language);
                    const questions = t('topics.questions', { count: topic.questionCount });
                    return (
                      <li key={topic.customTopicId} className="border-b border-hairline last:border-b-0">
                        <Link
                          to={`${LIST_PATH}/${topic.customTopicId}`}
                          aria-label={t('manage.row.a11y', { name: topic.name, questions, date })}
                          className="flex min-h-[56px] w-full min-w-[0] items-center gap-3 rounded-lg px-4 py-2"
                        >
                          <span className="flex min-w-[0] flex-1 flex-col">
                            <span lang={scriptLang(topic.name)} className="break-words text-body font-semibold text-ink">
                              {topic.name}
                            </span>
                            <span className="text-caption text-muted">{t('manage.row.sub', { count: topic.questionCount, date })}</span>
                          </span>
                          <span aria-hidden="true" className="flex-none text-muted">
                            ›
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        ) : null}
      </main>
    </PageColumn>
  );
}
