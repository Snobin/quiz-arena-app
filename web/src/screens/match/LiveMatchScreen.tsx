import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { RevealBand } from '../../design/peak/RevealBand.tsx';
import { formatSigned } from '../../i18n/format.ts';
import { detectLanguage } from '../../i18n/Lang.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { useReducedEffects } from '../../motion/reduceEffects.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { cancelRejoin, isRoomMatch, leaveMatch, rejoinMatch, submitAnswer, useLiveGame, type LiveMatch } from '../../realtime/liveGameStore.ts';
import * as liveMatchId from '../../realtime/liveMatchId.ts';
import { announce } from '../../shell/announce.ts';
import { Link } from '../../shell/Link.tsx';
import { navigate, searchParam } from '../../shell/router.ts';
import { preloadResults } from '../preload.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';
import { LeaveDialog } from './LeaveDialog.tsx';
import { OptionList, type OptionReveal } from './OptionList.tsx';
import { QuestionCard } from './QuestionCard.tsx';
import { ReconnectBanner } from './ReconnectBanner.tsx';
import { Countdown, RoomHeader, RoomStandings } from './RoomMatchParts.tsx';
import { ReportQuestion } from '../../report/ReportQuestion.tsx';
import { RevealDetails } from './RevealDetails.tsx';
import { opponentsOf } from './opponents.tsx';
import { ScoreStrip } from './ScoreStrip.tsx';
import { TimerBar } from './TimerBar.tsx';

const HOME_LINK = 'hit-target inline-flex min-h-target-min items-center text-body underline';

/** The Back guard: a duplicate /match history entry, marked so it can be told apart. */
function pushGuard(): void {
  const state: unknown = window.history.state;
  const base = typeof state === 'object' && state !== null ? state : {};
  window.history.pushState({ ...base, minnalGuard: true }, '', window.location.href);
}

function isGuardEntry(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { minnalGuard?: unknown }).minnalGuard === true;
}

/** How long the Forfeited notice shows before the results open. */
export const FORFEIT_NOTICE_MS = 2_000;
/** After the last reveal, the results open once this reveal hold has passed (and MATCH_ENDED is in). */
export const RESULTS_HOLD_MS = 2_000;
/** With no MATCH_ENDED this long after the hold, the results open anyway (the minimal view). */
export const MATCH_ENDED_WAIT_MS = 3_000;

/**
 * `/match` (Story 1.8): the live match screen. Full screen (no tab bar), in the
 * `.font-face-live` scope so the Malayalam face never swaps mid-match. It renders only the
 * live-game store, which the WebSocket module fills: no correctness, points or timing are
 * computed here beyond the countdown display.
 *
 * With `?matchId=` it shows the store's match only when the ids match; with no live match it
 * shows the "no match" line and Home.
 *
 * Story 1.9: while the socket is down the reconnect banner replaces the timer and everything below
 * it is dimmed to 42%, `inert` and `aria-hidden` (the countdown never pauses). A quiet Leave text
 * button ends the score strip row; it, and Android back, open the Leave dialog. Her own forfeit
 * shows the Forfeited notice, then the results; Leave goes to the results; an abort goes Home
 * (which shows the notice). An opponent who left gets a one-line notice and keeps her score.
 *
 * Story 1.10: a completed match opens `/results` after the reveal hold, once MATCH_ENDED is in.
 *
 * Rejoin after a reload: with no live match but a match id (`?matchId=`, else the one kept in
 * `sessionStorage`), it asks the connection module to rejoin and shows "Reconnecting…" until the
 * SNAPSHOT rebuilds the match. If the match is gone it opens `/results` when that match's result
 * is stored, else Home. With no id at all it shows the "no match" line.
 */
export function LiveMatchScreen() {
  const { t } = useTranslation();
  useHideTabBar();
  // Results open when the match ends: fetch that chunk while it is played.
  useEffect(preloadResults, []);
  const stored = useLiveGame((s) => s.live);
  const wanted = searchParam('matchId');
  const live = stored && (wanted === null || wanted === stored.matchId) ? stored : null;
  const question = live?.question ?? null;
  useDocumentTitle(
    question ? t('title.question', { n: question.questionIndex + 1, total: question.total }) : t('title.match'),
  );
  // Read once per mount: the stored id is only a hint for which match to ask about.
  const [storedId] = useState(() => liveMatchId.load()?.matchId ?? null);
  // Only when no match is in play here: a different match in play is never shown as the wanted
  // one (the "no match" view, as before); a settled one does not block the rejoin.
  const storedInPlay = stored !== null && stored.outcome === null && stored.phase !== 'ended';
  const rejoinId = live || storedInPlay ? null : (wanted ?? storedId);
  // The match this screen rejoined: when it arrives it is a live arrival (not for any later match).
  const rejoinedId = useRef<string | null>(null);
  if (rejoinId !== null) rejoinedId.current = rejoinId;

  if (!live && rejoinId !== null) {
    return <RejoiningView matchId={rejoinId} />;
  }

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
  return <LiveMatchView key={live.matchId} live={live} arrived={rejoinedId.current === live.matchId} />;
}

/**
 * Rejoining after a reload: "Reconnecting…" with no options until the SNAPSHOT. A match that is
 * gone opens its stored results, else Home.
 */
function RejoiningView({ matchId }: { matchId: string }) {
  const { t } = useTranslation();
  const rejoin = useLiveGame((s) => s.rejoin);
  // A `gone` left from before this screen asked does not count.
  const initialRejoin = useRef(rejoin);

  // Once per mount (StrictMode re-runs the effect; the ref survives it).
  const announced = useRef(false);
  useEffect(() => {
    rejoinMatch(matchId);
    if (!announced.current) {
      announced.current = true;
      announce(t('match.rejoining'));
    }
    // Leaving /match while pending stops it, so a late SNAPSHOT never lands behind another screen.
    return () => cancelRejoin(matchId);
  }, [matchId]);

  const gone = rejoin !== initialRejoin.current && rejoin?.matchId === matchId && rejoin.state === 'gone';
  useEffect(() => {
    if (!gone) return;
    navigate(lastResult.load()?.matchId === matchId ? '/results' : '/', { replace: true });
  }, [gone]);

  return (
    <PageColumn className="justify-center py-6">
      <main className="flex flex-col items-start gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('title.match')}
        </h1>
        <p data-testid="rejoining">{t('match.rejoining')}</p>
      </main>
    </PageColumn>
  );
}

function LiveMatchView({ live, arrived }: { live: LiveMatch; arrived: boolean }) {
  const { t } = useTranslation();
  const reduced = useReducedEffects();
  const clockOffsetMs = useLiveGame((s) => s.clockOffsetMs);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const started = live.question;
  const view = started?.question ?? null;
  const index = started?.questionIndex ?? -1;
  const reveal = live.reveal && live.reveal.questionIndex === index ? live.reveal : null;
  // Questions she marked "Something wrong?" during the reveals (Story 3.5); they survive a reload.
  const [marks, setMarks] = useState(() => new Set(lastResult.loadMarks(live.matchId)));
  const opponents = opponentsOf(live);
  // A Battle Room (Story 5.4) has its own header, countdown and standings; a 1v1 has one opponent.
  const room = isRoomMatch(live);
  const oneVsOne = !room && opponents.length === 1;
  const opponentLeftKey = oneVsOne ? 'match.opponentLeftWin' : 'match.opponentLeft';

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
    // Never in a room: fifty announcements per question would bury the one that matters.
    if (room) return;
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

  let optionReveal: OptionReveal | null = null;
  if (reveal) {
    const picks: OptionReveal['picks'] = {};
    // In a room the options carry no opponent names (there may be forty-nine): the standings are the place for them.
    for (const opponent of room ? [] : opponents) {
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

  // ---- Story 1.9: reconnect, forfeit and leave ----
  const outcome = live.outcome;
  const reconnecting = live.connection === 'reconnecting' && outcome === null;
  const inPlay = outcome === null && live.phase !== 'ended';
  const [dialogOpen, setDialogOpen] = useState(false);
  const dialogOpenRef = useRef(dialogOpen);
  dialogOpenRef.current = dialogOpen;
  const inPlayRef = useRef(inPlay);
  inPlayRef.current = inPlay;
  const showDialog = dialogOpen && inPlay;

  // The reconnect banner: assertive once at its start, polite once at its end; nothing per second.
  const wasReconnecting = useRef(false);
  useEffect(() => {
    if (reconnecting && !wasReconnecting.current) {
      announce(t('match.reconnecting', { seconds: 10 }), { assertive: true });
    } else if (!reconnecting && wasReconnecting.current && outcome === null) {
      announce(t('match.reconnected'));
    }
    wasReconnecting.current = reconnecting;
  }, [reconnecting]);

  // An opponent who left: one polite announcement each.
  const leftAnnounced = useRef(new Set<string>());
  const leftOpponents = opponents.filter((o) => live.forfeited.includes(o.participantId));
  useEffect(() => {
    for (const opponent of leftOpponents) {
      if (leftAnnounced.current.has(opponent.participantId)) continue;
      leftAnnounced.current.add(opponent.participantId);
      announce(t(opponentLeftKey, { name: opponent.displayName }));
    }
  }, [leftOpponents.length]);

  // The outcome as it arrives while she is here: forfeited (notice, then results), left
  // (results), aborted (Home, which shows the notice). One she already had when the screen
  // opened (Back from the results) does not navigate again. After a rejoin the match has just
  // arrived, so an outcome its SNAPSHOT carried (a forfeit after a slow reload) still navigates.
  const forfeitedNotice = oneVsOne
    ? t('match.forfeitedOneVsOne', { name: opponents[0]?.displayName ?? '' })
    : t('match.forfeited');
  const initialOutcome = useRef(arrived ? null : outcome);
  useEffect(() => {
    if (!outcome || outcome === initialOutcome.current) return undefined;
    if (outcome.kind === 'aborted') {
      announce(t('match.aborted'));
      navigate('/', { replace: true });
      return undefined;
    }
    if (room) {
      // A room's results open on `/results` once her MATCH_ENDED is in (below). Until then she stays on the standings.
      // One who confirmed Leave has nothing left to watch: Home.
      if (outcome.kind === 'left') navigate('/', { replace: true });
      else if (outcome.kind === 'forfeited') announce(forfeitedNotice);
      return undefined;
    }
    if (outcome.kind === 'left') {
      navigate('/results', { replace: true });
      return undefined;
    }
    if (outcome.kind === 'forfeited') {
      announce(forfeitedNotice);
      const timer = setTimeout(() => navigate('/results', { replace: true }), FORFEIT_NOTICE_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [outcome?.kind]);

  // Story 1.10: a completed match hands off to the results once both the last reveal and
  // MATCH_ENDED are in (in either order), after the reveal hold. With no MATCH_ENDED by
  // `MATCH_ENDED_WAIT_MS` after the hold (a match settled from NOT_IN_MATCH, say), the results
  // open anyway on the minimal view, which upgrades in place if MATCH_ENDED still comes.
  const completedHere = outcome?.kind === 'completed' && outcome !== initialOutcome.current;
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!completedHere) return undefined;
    const timer = setTimeout(() => setHeld(true), RESULTS_HOLD_MS);
    return () => clearTimeout(timer);
  }, [completedHere]);
  const hasEnded = live.ended !== null;
  // A room player who forfeited still gets MATCH_ENDED when the match ends: her results open straight away.
  const forfeitedRoomEnded = room && hasEnded && outcome?.kind === 'forfeited';
  useEffect(() => {
    if (forfeitedRoomEnded) navigate('/results', { replace: true });
  }, [forfeitedRoomEnded]);
  useEffect(() => {
    if (!held) return undefined;
    if (hasEnded) {
      navigate('/results', { replace: true });
      return undefined;
    }
    const timer = setTimeout(() => navigate('/results', { replace: true }), MATCH_ENDED_WAIT_MS);
    return () => clearTimeout(timer);
  }, [held, hasEnded]);

  const stay = () => {
    setDialogOpen(false);
    // Focus goes back to the question heading.
    setTimeout(() => headingRef.current?.focus(), 0);
  };
  const leave = () => {
    setDialogOpen(false);
    leaveMatch();
  };

  // Android back during the match opens the dialog (and Back again means Stay): a guard entry is
  // pushed once, and re-pushed each time Back lands on it while the match is in play.
  const guardArmed = useRef(false);
  useEffect(() => {
    if (!inPlayRef.current) return undefined;
    pushGuard();
    guardArmed.current = true;
    const onPopState = () => {
      if (!inPlayRef.current) return;
      pushGuard();
      if (dialogOpenRef.current) stay();
      else setDialogOpen(true);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Play ended here without navigating away (the last reveal): drop the guard entry once, so the
  // next Back leaves /match. Outcomes that navigate (left, forfeited, aborted) keep their own path.
  useEffect(() => {
    if (inPlay || !guardArmed.current) return;
    const kind = outcome?.kind;
    if (kind === 'left' || kind === 'forfeited' || kind === 'aborted') return;
    guardArmed.current = false;
    if (isGuardEntry(window.history.state)) window.history.back();
  }, [inPlay, outcome?.kind]);

  const blocked = reconnecting || showDialog;
  const leaveButton = inPlay ? (
    <Button variant="danger-text" data-testid="leave-button" className="ml-auto" onClick={() => setDialogOpen(true)}>
      {t('match.leave')}
    </Button>
  ) : null;

  const answerable =
    live.phase === 'open' && live.myAnswer === null && reveal === null && !reconnecting && outcome === null;
  const windowSeconds = started ? Math.round((Date.parse(started.deadline) - Date.parse(started.startedAt)) / 1000) : 0;

  return (
    <PageColumn className="font-face-live pb-6">
      <main className="flex flex-col">
        {reconnecting && live.reconnectDeadline !== null ? <ReconnectBanner deadline={live.reconnectDeadline} /> : null}
        <div
          data-testid="match-content"
          className={blocked ? 'flex flex-col opacity-[0.42]' : 'flex flex-col'}
          inert={blocked}
          aria-hidden={blocked ? true : undefined}
        >
        {started ? (
          <div hidden={reconnecting}>
          <TimerBar
            questionIndex={started.questionIndex}
            total={started.total}
            startedAt={started.startedAt}
            deadline={started.deadline}
            clockOffsetMs={clockOffsetMs}
            reduced={reduced}
            closed={reveal !== null}
          />
          </div>
        ) : null}

        {room ? (
          <RoomHeader live={live} trailing={leaveButton} />
        ) : (
          <ScoreStrip live={live} trailing={leaveButton} />
        )}

        {leftOpponents.map((opponent) => (
          <p key={opponent.participantId} data-testid="notice-opponent-left" className="mt-2 text-label text-muted">
            {t(opponentLeftKey, { name: opponent.displayName })}
          </p>
        ))}
        {outcome?.kind === 'forfeited' ? (
          <div className="mt-2 flex flex-col items-start gap-2">
            <p data-testid="notice-forfeited" className="text-body font-bold text-ink">
              {forfeitedNotice}
            </p>
            {room ? (
              <Link to="/" className={HOME_LINK}>
                {t('common.home')}
              </Link>
            ) : outcome === initialOutcome.current ? (
              <Link to="/results" className={HOME_LINK}>
                {t('results.title')}
              </Link>
            ) : null}
          </div>
        ) : null}

        {!started || !view ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className="mt-8 font-title text-title">
              {t('match.getReady')}
            </h1>
            {room && live.firstQuestionAt !== null ? (
              <Countdown firstQuestionAt={live.firstQuestionAt} clockOffsetMs={clockOffsetMs} />
            ) : null}
            {room ? <RoomStandings live={live} /> : null}
          </>
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
              label={
                live.topic
                  ? room && live.questionSource === 'CUSTOM'
                    ? t('room.live.title', { topic: live.topic.name })
                    : `${t('mode.topicDuel.title')} · ${live.topic.name}`
                  : undefined
              }
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

            {reveal ? <RevealDetails explanation={reveal.explanation} attribution={reveal.attribution} hideSource={live.questionSource === 'CUSTOM'} /> : null}
            {reveal ? (
              // Story 3.5: the tap only marks the question; the note is added on the results (no typing in play).
              <ReportQuestion
                questionId={reveal.questionId}
                version={reveal.version}
                surface="LIVE_REVEAL"
                matchId={live.matchId}
                questionSource={live.questionSource}
                marked={marks.has(lastResult.markKey(reveal.questionId, reveal.version))}
                onMark={() => {
                  lastResult.saveMark(live.matchId, reveal.questionId, reveal.version);
                  setMarks(new Set(lastResult.loadMarks(live.matchId)));
                }}
              />
            ) : null}

            {reveal ? null : (
              <p data-testid="footer" className="mt-6 text-center text-label text-muted">
                {acked
                  ? t('match.waitingFor', { name: waitingFor })
                  : live.myAnswer?.status === 'locked'
                    ? t('match.lockedFooter')
                    : t('match.firstTapHint')}
              </p>
            )}

            {room ? <RoomStandings live={live} /> : null}

          </>
        )}
        </div>
      </main>
      {showDialog ? <LeaveDialog onStay={stay} onLeave={leave} /> : null}
    </PageColumn>
  );
}
