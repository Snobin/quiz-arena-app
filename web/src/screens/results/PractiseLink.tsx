import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cancelRematch } from '../../realtime/liveGameStore.ts';
import { useOnline } from '../../shell/online.ts';
import { navigate } from '../../shell/router.ts';
import { PracticeError, saveStored, startPractice } from '../practice/practiceApi.ts';
import { TOPICS_QUERY_KEY } from '../topics/TopicPicker.tsx';
import { markTopicUsed } from '../topics/topicsApi.ts';
import './practiseCatalogue.ts';

const LINK = 'hit-target inline-flex min-h-target-min min-w-target-min items-center justify-end px-2 text-caption font-semibold text-ink underline';
const PRACTICE_PATH = '/practice/';
const PICKER_SMALL = '/play/topics?for=solo&notice=small';

/**
 * Story 4.4: "Practise this topic" under an expanded breakdown row. Loaded lazily (the entry-chunk budget); the caller
 * decides visibility (registered, bank match, a topic). A tap withdraws any pending rematch, starts a Solo Practice
 * session through the Story 4.3 API, stores it so the practice screen resumes it, notes the topic as recent
 * (best effort) and opens the practice screen. The server alone judges eligibility.
 */
export default function PractiseLink({ topicId, index }: { topicId: string; index: number }) {
  const { t } = useTranslation();
  const online = useOnline();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const start = async () => {
    if (busy.current || !online) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    cancelRematch();
    try {
      const started = await startPractice(topicId);
      saveStored(topicId, { sessionId: started.sessionId, answered: 0, correct: 0 });
      void markTopicUsed(topicId);
      navigate(`${PRACTICE_PATH}${encodeURIComponent(topicId)}`);
    } catch (error) {
      if (error instanceof PracticeError && (error.kind === 'unavailable' || error.kind === 'expired')) {
        void queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
        navigate(PICKER_SMALL);
        return;
      }
      if (alive.current) setFailed(true);
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  };

  return (
    <div data-testid="practise" className="mt-1 flex flex-col items-end">
      <button
        type="button"
        data-testid="practise-link"
        aria-label={t('practise.label', { n: index + 1 })}
        aria-disabled={!online || pending}
        className={LINK}
        onClick={() => void start()}
      >
        {pending ? '…' : t('practise.link')}
      </button>
      {!online ? <p className="text-caption text-muted">{t('offline.playCaption')}</p> : null}
      {failed && online ? (
        <p role="alert" data-testid="practise-error" className="flex items-center gap-2 text-caption text-brick">
          {t('practise.error')}
          <button type="button" data-testid="practise-retry" className={LINK} onClick={() => void start()}>
            {t('practise.retry')}
          </button>
        </p>
      ) : null}
    </div>
  );
}
