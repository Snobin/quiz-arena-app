import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PageColumn } from '../../design/PageColumn.tsx';
import { RevealBand } from '../../design/peak/RevealBand.tsx';
import { formatSigned } from '../../i18n/format.ts';
import { detectLanguage } from '../../i18n/Lang.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { useReducedEffects } from '../../motion/reduceEffects.ts';
import { submitAnswer, useLiveGame, type LiveMatch } from '../../realtime/liveGameStore.ts';
import { announce } from '../../shell/announce.ts';
import { Link } from '../../shell/Link.tsx';
import { searchParam } from '../../shell/router.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';
import { OptionList, type OptionReveal } from './OptionList.tsx';
import { QuestionCard } from './QuestionCard.tsx';
import { RevealDetails } from './RevealDetails.tsx';
import { opponentsOf } from './opponents.tsx';
import { ScoreStrip } from './ScoreStrip.tsx';
import { TimerBar } from './TimerBar.tsx';

const HOME_LINK = 'hit-target inline-flex min-h-target-min items-center text-body underline';

/**
 * `/match` (Story 1.8): the live match screen. Full screen (no tab bar), in the
 * `.font-face-live` scope so the Malayalam face never swaps mid-match. It renders only the
 * live-game store, which the WebSocket module fills: no correctness, points or timing are
 * computed here beyond the countdown display.
 *
 * With `?matchId=` it shows the store's match only when the ids match; with no live match it
 * shows the "no match" line and Home.
 */
export function LiveMatchScreen() {
  const { t } = useTranslation();
  useHideTabBar();
  const stored = useLiveGame((s) => s.live);
  const wanted = searchParam('matchId');
  const live = stored && (wanted === null || wanted === stored.matchId) ? stored : null;
  const question = live?.question ?? null;
  useDocumentTitle(
    question ? t('title.question', { n: question.questionIndex + 1, total: question.total }) : t('title.match'),
  );

  if (!live) {
    return (
      <PageColumn className="justify-center py-6">
        <main className="flex flex-col items-start gap-3">
          <h1 tabIndex={-1} className="font-title text-title">
            {t('title.match')}
          </h1>
          <p>{t('match.none')}</p>
          <Link to="/" className={HOME_LINK}>
            {t('common.home')}
          </Link>
        </main>
      </PageColumn>
    );
  }
  // Keyed by match: the per-question announcement guards start fresh for a new match.
  return <LiveMatchView key={live.matchId} live={live} />;
}

function LiveMatchView({ live }: { live: LiveMatch }) {
  const { t } = useTranslation();
  const reduced = useReducedEffects();
  const clockOffsetMs = useLiveGame((s) => s.clockOffsetMs);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const started = live.question;
  const view = started?.question ?? null;
  const index = started?.questionIndex ?? -1;
  const reveal = live.reveal && live.reveal.questionIndex === index ? live.reveal : null;
  const opponents = opponentsOf(live);

  // A new question: focus its heading (whose name is the text, then the position).
  useEffect(() => {
    if (index >= 0) headingRef.current?.focus();
  }, [index, started?.question.questionId]);

  // "Locked in", once per question; a 1v1 ack announces her result instead (below).
  const lockedFor = useRef(-1);
  const myAnswer = live.myAnswer;
  useEffect(() => {
    if (myAnswer?.status === 'locked' && myAnswer.result === null && lockedFor.current !== myAnswer.questionIndex) {
      lockedFor.current = myAnswer.questionIndex;
      announce(t('match.locked'));
    }
  }, [myAnswer?.status, myAnswer?.questionIndex]);

  // The opponent answering, once per question each.
  const answeredAnnounced = useRef(new Set<string>());
  useEffect(() => {
    for (const opponent of opponents) {
      const key = `${index}:${opponent.participantId}`;
      if (live.answered.includes(opponent.participantId) && !answeredAnnounced.current.has(key)) {
        answeredAnnounced.current.add(key);
        announce(t('match.opponentAnswered', { name: opponent.displayName }));
      }
    }
  }, [live.answered, index]);

  const self = reveal?.results.find((r) => r.participantId === live.selfParticipantId) ?? null;
  // Her own result for this question (Story 1.11): the 1v1 ack first, then the reveal. Every
  // number is the server's; once the reveal is in, its (equal) numbers are shown.
  const acked = myAnswer?.questionIndex === index && myAnswer.status === 'locked' ? myAnswer.result : null;
  const own = reveal
    ? {
        correct: self?.correct === true,
        points: self?.points ?? null,
        answerIndex: reveal.answerIndex,
        totalScore: self?.totalScore ?? live.totals[live.selfParticipantId] ?? 0,
      }
    : acked
      ? { correct: acked.correct, points: acked.points, answerIndex: acked.answerIndex, totalScore: acked.totalScore }
      : null;
  const answerText = own && view ? (view.options[own.answerIndex] ?? '') : '';
  const selfTotal = own?.totalScore ?? live.totals[live.selfParticipantId] ?? 0;

  // Her result, once per question, whichever comes first (the 1v1 ack or the reveal); the close
  // after an ack adds nothing spoken. Focus stays where it is.
  const revealedFor = useRef(-1);
  useEffect(() => {
    if (!own || index < 0 || revealedFor.current === index) return;
    revealedFor.current = index;
    announce(
      own.correct && own.points !== null
        ? t('match.revealCorrect', { answer: answerText, points: own.points, total: own.totalScore })
        : t('match.revealWrong', { answer: answerText, total: own.totalScore }),
    );
  }, [own !== null, index]);

  // The match is over: said once, after the last reveal's announcement.
  const overAnnounced = useRef(false);
  useEffect(() => {
    if (live.phase !== 'ended' || overAnnounced.current) return;
    overAnnounced.current = true;
    announce(t('match.over', { total: selfTotal }));
  }, [live.phase]);

  let optionReveal: OptionReveal | null = null;
  if (reveal) {
    const picks: OptionReveal['picks'] = {};
    for (const opponent of opponents) {
      const result = reveal.results.find((r) => r.participantId === opponent.participantId);
      if (result?.pickedIndex != null) {
        (picks[result.pickedIndex] ??= []).push({ participantId: opponent.participantId, name: opponent.displayName });
      }
    }
    optionReveal = { answerIndex: reveal.answerIndex, selfPick: self?.pickedIndex ?? null, picks };
  } else if (acked && myAnswer) {
    // Her own result before the close: the answer and her pick only, no opponent's pick.
    optionReveal = { answerIndex: acked.answerIndex, selfPick: myAnswer.optionIndex, picks: {}, partial: true };
  }
  const waitingFor = opponents[0]?.displayName ?? '';

  const answerable = live.phase === 'open' && live.myAnswer === null && reveal === null;
  const windowSeconds = started ? Math.round((Date.parse(started.deadline) - Date.parse(started.startedAt)) / 1000) : 0;

  return (
    <PageColumn className="font-face-live pb-6">
      <main className="flex flex-col">
        {started ? (
          <TimerBar
            questionIndex={started.questionIndex}
            total={started.total}
            startedAt={started.startedAt}
            deadline={started.deadline}
            clockOffsetMs={clockOffsetMs}
            reduced={reduced}
            closed={reveal !== null}
          />
        ) : null}

        <ScoreStrip live={live} />

        {!started || !view ? (
          <h1 tabIndex={-1} className="mt-8 font-title text-title">
            {t('match.getReady')}
          </h1>
        ) : (
          <>
            {own ? (
              <div className="mt-3">
                {/* Keyed by question, not by source: the close after a 1v1 ack never replays the peak. */}
                <RevealBand
                  key={`band-${index}`}
                  revealKey={`${index}`}
                  correct={own.correct}
                  reduced={reduced}
                  label={own.correct ? t('match.bandCorrect', { n: index + 1 }) : t('match.correctAnswer')}
                  answer={answerText}
                  answerLang={detectLanguage(answerText)}
                  points={own.points !== null ? formatSigned(own.points) : undefined}
                  total={t('match.totalShort', { total: own.totalScore })}
                  wrongLine={own.correct ? undefined : t('match.wrong', { answer: answerText })}
                />
              </div>
            ) : null}

            <QuestionCard
              key={`question-${started.questionIndex}:${view.questionId}`}
              view={view}
              headingRef={headingRef}
              position={t('match.questionPosition', {
                n: started.questionIndex + 1,
                total: started.total,
                seconds: windowSeconds,
              })}
            />

            <OptionList
              key={`options-${started.questionIndex}:${view.questionId}`}
              options={view.options}
              answerable={answerable}
              myAnswer={live.myAnswer?.questionIndex === index ? live.myAnswer : null}
              reveal={optionReveal}
              onCommit={(optionIndex) => submitAnswer(optionIndex)}
            />

            {reveal ? <RevealDetails explanation={reveal.explanation} attribution={reveal.attribution} /> : null}

            {reveal ? null : (
              <p data-testid="footer" className="mt-6 text-center text-label text-muted">
                {acked
                  ? t('match.waitingFor', { name: waitingFor })
                  : live.myAnswer?.status === 'locked'
                    ? t('match.lockedFooter')
                    : t('match.firstTapHint')}
              </p>
            )}

            {live.phase === 'ended' ? (
              <div className="mt-6 flex flex-col items-start gap-2">
                <p data-testid="match-over" className="font-title text-title">
                  {t('match.over', { total: selfTotal })}
                </p>
                <Link to="/" className={HOME_LINK}>
                  {t('common.home')}
                </Link>
              </div>
            ) : null}
          </>
        )}
      </main>
    </PageColumn>
  );
}
