import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { detectLanguage } from '../../i18n/Lang.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { ReportQuestion } from '../../report/ReportQuestion.tsx';
import { announce } from '../../shell/announce.ts';
import { useOnline } from '../../shell/online.ts';
import { navigate, setNavigationGuard } from '../../shell/router.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';
import { QuestionCard } from '../match/QuestionCard.tsx';
import { RevealDetails } from '../match/RevealDetails.tsx';
import { TOPICS_QUERY_KEY } from '../topics/TopicPicker.tsx';
import {
  PracticeError,
  clearStored,
  endPractice,
  fetchNext,
  loadStored,
  saveStored,
  sendAnswer,
  startPractice,
  type AnswerResult,
  type NextQuestion,
  type Tally,
} from './practiceApi.ts';
import './practiceCatalogue.ts';
import { PracticeOptions } from './practiceOptions.tsx';
import { PRACTICE_PICKER, PracticeEnd } from './PracticeSummary.tsx';

type Phase = 'loading' | 'question' | 'summary' | 'expired';
type Failure = { message: string; retry: () => void };

/** A bar fixed to the bottom with a spacer as tall as it is, so the last content stays clear of it. */
function ActionBar({ children }: { children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return undefined;
    const measure = () => setHeight(bar.offsetHeight);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(bar);
    return () => observer?.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden="true" className="shrink-0" style={{ height }} />
      <div
        ref={barRef}
        data-testid="practice-actions"
        className="fixed inset-x-[0] bottom-[0] z-10 border-t border-hairline bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex w-full max-w-[480px] flex-col px-gutter-card py-3">{children}</div>
      </div>
    </>
  );
}

/**
 * `/practice/:topicId` (Story 4.3): untimed, unrated practice on one bank topic. The server decides correctness and
 * sends the answer only in the answer response; this screen never computes it. No timer, score, opponent or volt.
 */
export default function PracticeScreen({ topicId }: { topicId: string }) {
  const { t } = useTranslation();
  const online = useOnline();
  const queryClient = useQueryClient();
  useHideTabBar();

  const sessionRef = useRef<string | null>(null);
  const leaving = useRef(false);
  const alive = useRef(true);
  const began = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [busy, setBusy] = useState(false);
  const [topicName, setTopicName] = useState<string | undefined>();
  const [tally, setTally] = useState<Tally>({ answeredCount: 0, correctCount: 0 });
  const [current, setCurrent] = useState<NextQuestion | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const tallyRef = useRef(tally);
  tallyRef.current = tally;

  useDocumentTitle(topicName ? t('title.practice', { topic: topicName }) : t('title.practiceBare'));

  const remember = useCallback(
    (next: Tally) => {
      tallyRef.current = next;
      setTally(next);
      if (sessionRef.current) saveStored(topicId, { sessionId: sessionRef.current, answered: next.answeredCount, correct: next.correctCount });
    },
    [topicId],
  );

  const expire = useCallback(() => {
    clearStored(topicId);
    setBusy(false);
    setFailure(null);
    setPhase('expired');
  }, [topicId]);

  const toPicker = useCallback(
    (suffix = '') => {
      leaving.current = true;
      navigate(`${PRACTICE_PICKER}${suffix}`, { replace: suffix !== '' });
    },
    [],
  );

  /** Fetches the next question; `onGone` handles a missing session (a resume falls back to a fresh start). */
  const loadNext = useCallback(
    async (sessionId: string, onGone: () => void = expire) => {
      setBusy(true);
      setFailure(null);
      try {
        const next = await fetchNext(sessionId);
        if (!alive.current) return;
        if (next.source.type === 'BANK') setTopicName(next.source.topicName);
        setCurrent(next);
        setPick(null);
        setSending(false);
        setResult(null);
        setPhase('question');
        setBusy(false);
        remember({ answeredCount: next.position - 1, correctCount: Math.min(tallyRef.current.correctCount, next.position - 1) });
        if (next.reshuffled) announce(t('practice.reshuffled'));
      } catch (error) {
        if (!alive.current) return;
        if (error instanceof PracticeError && error.kind === 'expired') {
          onGone();
          return;
        }
        setBusy(false);
        setFailure({ message: error instanceof PracticeError && error.detail ? error.detail : t('practice.error.generic'), retry: () => void loadNext(sessionId, onGone) });
      }
    },
    [expire, remember, t],
  );

  const startNew = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    setPhase('loading');
    try {
      const started = await startPractice(topicId);
      if (!alive.current) return;
      sessionRef.current = started.sessionId;
      if (started.source.type === 'BANK') setTopicName(started.source.topicName);
      remember({ answeredCount: 0, correctCount: 0 });
      await loadNext(started.sessionId);
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof PracticeError && error.kind === 'unavailable') {
        void queryClient.invalidateQueries({ queryKey: TOPICS_QUERY_KEY });
        toPicker('&notice=small');
        return;
      }
      setBusy(false);
      setFailure({ message: error instanceof PracticeError && error.detail ? error.detail : t('practice.error.generic'), retry: () => void startNew() });
    }
  }, [loadNext, queryClient, remember, t, toPicker, topicId]);

  // Resume the stored session after a reload, else start one.
  useEffect(() => {
    alive.current = true;
    if (!began.current) {
      began.current = true;
      const stored = loadStored(topicId);
      if (stored) {
        sessionRef.current = stored.sessionId;
        tallyRef.current = { answeredCount: stored.answered, correctCount: stored.correct };
        setTally(tallyRef.current);
        void loadNext(stored.sessionId, () => {
          clearStored(topicId);
          void startNew();
        });
      } else {
        void startNew();
      }
    }
    return () => {
      alive.current = false;
    };
  }, [loadNext, startNew, topicId]);

  // Focus: the question heading when a question loads, Next once its result shows.
  const questionId = current?.question.questionId;
  useEffect(() => {
    if (phase === 'question' && !result) headingRef.current?.focus();
  }, [phase, questionId, result]);
  useEffect(() => {
    if (result) nextRef.current?.querySelector('button')?.focus();
  }, [result]);

  const answer = async (optionIndex: number) => {
    const sessionId = sessionRef.current;
    if (!current || !sessionId || result || sending) return;
    setPick(optionIndex);
    setSending(true);
    setFailure(null);
    try {
      const outcome = await sendAnswer(sessionId, current.question.questionId, current.question.version, optionIndex);
      if (!alive.current) return;
      setResult(outcome);
      setSending(false);
      remember({ answeredCount: outcome.answeredCount, correctCount: outcome.correctCount });
      const text = current.question.options[outcome.answerIndex] ?? '';
      announce(t(outcome.correct ? 'practice.announce.correct' : 'practice.announce.wrong', { answer: text }));
    } catch (error) {
      if (!alive.current) return;
      setSending(false);
      setPick(null);
      if (error instanceof PracticeError && error.kind === 'expired') return expire();
      // Not the question being practised (answered elsewhere): move on to the one the server holds.
      if (error instanceof PracticeError && error.kind === 'conflict') return void loadNext(sessionId);
      setFailure({ message: t('practice.error.answer'), retry: () => void answer(optionIndex) });
    }
  };

  const stop = useCallback(async () => {
    const sessionId = sessionRef.current;
    if (tallyRef.current.answeredCount === 0) {
      if (sessionId) void endPractice(sessionId).catch(() => undefined);
      clearStored(topicId);
      toPicker();
      return;
    }
    if (!sessionId) return;
    setBusy(true);
    setFailure(null);
    try {
      const final = await endPractice(sessionId);
      if (!alive.current) return;
      leaving.current = true;
      clearStored(topicId);
      setTally(final);
      setBusy(false);
      setPhase('summary');
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof PracticeError && error.kind === 'expired') return expire();
      if (error instanceof PracticeError && error.kind === 'network') {
        // The end request never arrived: the server session simply expires. Leave rather than trap her behind the Back guard.
        clearStored(topicId);
        setBusy(false);
        toPicker();
        return;
      }
      setBusy(false);
      setFailure({ message: t('practice.error.generic'), retry: () => void stop() });
    }
  }, [expire, t, toPicker, topicId]);

  // Android back / browser Back is Stop: the summary when something was answered, else straight out.
  useEffect(() => {
    if (phase !== 'question' && phase !== 'loading') return undefined;
    return setNavigationGuard(() => {
      if (leaving.current) return false;
      if (tallyRef.current.answeredCount > 0) {
        void stop();
        return true;
      }
      const sessionId = sessionRef.current;
      if (sessionId) void endPractice(sessionId).catch(() => undefined);
      clearStored(topicId);
      return false;
    });
  }, [phase, stop, topicId]);

  const again = () => {
    leaving.current = false;
    sessionRef.current = null;
    clearStored(topicId);
    remember({ answeredCount: 0, correctCount: 0 });
    void startNew();
  };

  if (phase === 'summary' || phase === 'expired') return <PracticeEnd kind={phase} tally={tally} onAgain={again} />;

  const failureBlock = failure ? (
    <div data-testid="practice-error" role="alert" className="mt-4 flex flex-col items-start gap-2">
      <p className="text-body text-brick">{failure.message}</p>
      <Button variant="secondary" onClick={failure.retry}>
        {t('common.retry')}
      </Button>
    </div>
  ) : null;

  if (!current || phase === 'loading') {
    return (
      <PageColumn className="py-4">
        <main>
          <h1 ref={headingRef} tabIndex={-1} className="sr-only">
            {t('common.loading')}
          </h1>
          {failureBlock}
        </main>
      </PageColumn>
    );
  }

  const view = current.question;
  const answerText = result ? (view.options[result.answerIndex] ?? '') : '';
  const unavailable = !online && !result;

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col">
        <header className="flex items-center justify-between gap-3">
          <p lang={topicName ? detectLanguage(topicName) : undefined} data-testid="practice-topic" className="min-w-[0] flex-1 break-words text-body font-semibold">
            {topicName}
          </p>
          <Button variant="secondary" onClick={() => void stop()}>
            {t('practice.stop')}
          </Button>
        </header>
        <p data-testid="practice-tally" className="mt-2 text-caption tabular-nums text-muted">
          {t('practice.tally', { answered: tally.answeredCount, correct: tally.correctCount })}
        </p>
        {current.reshuffled ? (
          <p data-testid="practice-reshuffled" className="mt-3 text-body text-ink">
            {t('practice.reshuffled')}
          </p>
        ) : null}
        <QuestionCard
          key={view.questionId}
          view={view}
          position={t('practice.position', { n: current.position })}
          headingRef={headingRef}
          label={t('practice.label')}
        />
        <PracticeOptions
          options={view.options}
          answerable={!result && !sending && online}
          pending={sending ? pick : null}
          reveal={result ? { answerIndex: result.answerIndex, selfPick: pick } : null}
          unavailable={unavailable}
          onCommit={(index) => void answer(index)}
        />
        {unavailable ? <p className="mt-3 text-caption text-muted">{t('offline.playCaption')}</p> : null}
        {result ? (
          <>
            <p data-testid="practice-result" className="mt-4 text-body font-semibold text-ink">
              <span lang={result.correct ? undefined : detectLanguage(answerText)}>
                {result.correct ? t('practice.result.correct') : t('practice.result.wrong', { answer: answerText })}
              </span>
            </p>
            <RevealDetails explanation={result.explanation} attribution={result.attribution ?? null} />
            <ReportQuestion
              key={`${view.questionId}:${view.version}`}
              questionId={view.questionId}
              version={view.version}
              surface="SOLO"
              questionSource={current.source.type === 'BANK' ? 'BANK' : null}
            />
          </>
        ) : null}
        {failureBlock}
      </main>
      {result ? (
        <ActionBar>
          <div ref={nextRef}>
            {online && !busy ? (
              <Button className="w-full" onClick={() => void loadNext(sessionRef.current ?? '')}>
                {t('practice.next')}
              </Button>
            ) : (
              <Button className="w-full" disabled disabledReason={t(online ? 'common.loading' : 'offline.playCaption')}>
                {t('practice.next')}
              </Button>
            )}
          </div>
        </ActionBar>
      ) : null}
    </PageColumn>
  );
}
