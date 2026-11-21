import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { session as authSession } from '../../auth/session.ts';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { detectLanguage } from '../../i18n/Lang.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { announce } from '../../shell/announce.ts';
import { Link } from '../../shell/Link.tsx';
import { navigate, searchParam } from '../../shell/router.ts';
import { useOnline } from '../../shell/online.ts';
import { CountStepper } from './CountStepper.tsx';
import { pickerPath } from './pickerReturn.ts';
import { RoomError } from './RoomError.tsx';
import { saveRecentRoom } from './recentRooms.ts';
import { clampCount, countLimits, DEFAULT_QUESTIONS } from './roomConfig.ts';
import { formatCode } from './roomCode.ts';
import { roomClient, type RoomError as RoomErrorValue } from './roomClient.ts';
import { findTopic, useCatalogue } from './useCatalogue.ts';
import './roomCatalogue.ts';

const LINK = 'hit-target inline-flex min-h-target-min items-center text-body font-semibold text-ink underline';

function initialCount(): number {
  const value = Number(searchParam('count'));
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_QUESTIONS;
}

/**
 * `/rooms/create` (Story 5.2): a source row, a count row and Create. The topic comes back from the picker (or a recent
 * row) in the query, so a reload keeps it. A failed create shows its error inline and keeps the chosen values.
 */
export default function CreateRoom() {
  const { t } = useTranslation();
  useDocumentTitle(t('rooms.create'));
  const online = useOnline();
  const catalogue = useCatalogue();
  const sourceLabel = useId();
  const countLabel = useId();
  const topicId = searchParam('topicId');
  const found = findTopic(catalogue.data, topicId);
  const limits = countLimits(found?.topic.publishedCount);
  const [count, setCount] = useState(initialCount);
  const shown = clampCount(count, limits);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<RoomErrorValue | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A topic with fewer questions than the count lowers it, announced politely once.
  const lowered = useRef<string | null>(null);
  useEffect(() => {
    if (!found || count <= limits.max) return;
    setCount(limits.max);
    const key = `${found.topic.topicId}:${limits.max}`;
    if (lowered.current === key) return;
    lowered.current = key;
    announce(t('rooms.count.lowered', { count: limits.max }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.topic.topicId, limits.max, count]);

  const catalogueFailed = !catalogue.data && catalogue.isError;
  const reason = !online ? t('rooms.offline') : !found ? t('rooms.source.chooseFirst') : null;

  const create = () => {
    if (!found || !online || sending) return;
    setSending(true);
    setError(null);
    void roomClient()
      .create({ source: { type: 'BANK', topicId: found.topic.topicId }, questionCount: shown })
      .then((result) => {
        if (!mounted.current) return;
        setSending(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const userId = authSession.userId();
        if (userId) {
          saveRecentRoom(userId, {
            source: { type: 'BANK', topicId: found.topic.topicId },
            topicName: found.topic.name,
            subjectName: found.subject.name,
            questionCount: shown,
            hostedAt: new Date().toISOString(),
          });
        }
        navigate(`/r/${formatCode(result.session.code)}`, { replace: true });
      });
  };

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-4">
        <Link to="/rooms" className={LINK}>
          {t('rooms.create.back')}
        </Link>
        <h1 tabIndex={-1} className="font-title text-title">
          {t('rooms.create')}
        </h1>

        <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-card p-4">
          <section aria-labelledby={sourceLabel} className="flex flex-col gap-1">
            <h2 id={sourceLabel} className="text-caption text-muted">
              {t('rooms.source.label')}
            </h2>
            {found ? (
              <>
                <p lang={detectLanguage(found.topic.name)} className="text-body font-semibold break-words text-ink">
                  {found.topic.name}
                </p>
                <p lang={detectLanguage(found.subject.name)} className="text-caption break-words text-muted">
                  {found.subject.name}
                </p>
                <Link to={pickerPath({ count: shown })} className={LINK}>
                  {t('rooms.source.change')}
                </Link>
              </>
            ) : topicId && !catalogue.data && !catalogueFailed ? (
              <p className="text-body text-muted">{t('rooms.source.loading')}</p>
            ) : catalogueFailed ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-body text-ink">{t('rooms.source.loadFailed')}</p>
                <Button variant="secondary" onClick={() => void catalogue.refetch()}>
                  {t('common.retry')}
                </Button>
              </div>
            ) : (
              <Link to={pickerPath({ count: shown })} className="hit-target inline-flex min-h-target-min items-center justify-center self-start rounded-md border-[1.5px] border-ink bg-card px-4 py-2 text-body text-ink">
                {t('rooms.source.choose')}
              </Link>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 id={countLabel} className="text-caption text-muted">
              {t('rooms.count.label')}
            </h2>
            <CountStepper value={shown} limits={limits} onChange={setCount} labelledBy={countLabel} />
          </section>
        </div>

        {error ? <RoomError error={error} scope="create" returnTo={`/rooms/create${window.location.search}`} /> : null}

        {reason || sending ? (
          <Button className="w-full" disabled disabledReason={sending ? t('rooms.create.sending') : reason!}>
            {t('rooms.create.submit')}
          </Button>
        ) : (
          <Button className="w-full" onClick={create}>
            {t('rooms.create.submit')}
          </Button>
        )}
      </main>
    </PageColumn>
  );
}
