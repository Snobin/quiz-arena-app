import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { session, useSession } from '../../auth/session.ts';
import { BotBadge } from '../../design/BotBadge.tsx';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { motion } from '../../design/tokens.ts';
import { useMatchDelta } from '../../ratings/useMatchDelta.ts';
import { formatNumber } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { useReducedEffects } from '../../motion/reduceEffects.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { cancelRematch, requestRematch, useLiveGame, type LiveMatch } from '../../realtime/liveGameStore.ts';
import type { MatchEndedPayload } from '../../realtime/protocol.ts';
import { announce } from '../../shell/announce.ts';
import { Link } from '../../shell/Link.tsx';
import { navigate } from '../../shell/router.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';
import { BreakdownRow } from './BreakdownRow.tsx';
import { DotStrip } from './DotStrip.tsx';
import { GuestResultsPrompt } from './GuestResultsPrompt.tsx';
import { resultView, type ResultView } from './outcome.ts';
import { Podium } from './Podium.tsx';
import { RematchCard } from './RematchCard.tsx';
import { ResultsBand } from './ResultsBand.tsx';
import { RoomStandings } from './RoomStandings.tsx';
import { WinTakeover } from './WinTakeover.tsx';
import '../rooms/roomCatalogue.ts';

/** Matches whose takeover has played in this page session: it never replays (Back, re-render). */
const takeoverPlayed = new Set<string>();

/** `guest`: she was not signed in when the match ended; null for a live arrival (her session now says). */
type FullResult = { payload: MatchEndedPayload; selfId: string; liveArrival: boolean; guest: boolean | null };

/**
 * `/results` (Story 1.10). The full screen comes from MATCH_ENDED: in the store when it arrived
 * in this page session, else from `sessionStorage` after a reload (`lastResult.ts`). It shows
 * the win takeover (live arrivals only, never on a reload), the loss or draw band, the dot strip,
 * the breakdown and a fixed Home bar. Every placement, correctness and point is the server's.
 *
 * The full view's bar offers Rematch (Story 1.10 part 2): see `RematchActions`. When a new match
 * arrives (MATCH_FOUND, typically the rematch) while she is here, `/match` opens at once.
 *
 * Without MATCH_ENDED yet (she forfeited or left while the match goes on, or the match settled
 * with no MATCH_ENDED) it shows the minimal view of Story 1.9 from the store's `outcome`, and
 * upgrades in place when MATCH_ENDED arrives. With nothing stored or held (or a corrupt entry,
 * or an abort) it goes Home.
 */
export function ResultsScreen() {
  const { t } = useTranslation();
  useHideTabBar();
  const live = useLiveGame((s) => s.live);
  const [stored] = useState(() => lastResult.load());

  let full: FullResult | null = null;
  if (live?.ended && live.ended.matchId === live.matchId) {
    full = { payload: live.ended, selfId: live.selfParticipantId, liveArrival: true, guest: null };
  } else if (stored && (live === null || stored.matchId === live.matchId)) {
    full = { payload: stored.payload, selfId: stored.selfId, liveArrival: false, guest: stored.guest };
  }
  // The match these results are about, fixed at mount: a different live match later is a new one.
  const [shownMatchId] = useState(() => live?.matchId ?? stored?.matchId ?? null);
  const newMatch = live !== null && shownMatchId !== null && live.matchId !== shownMatchId && live.outcome === null;
  if (newMatch) full = null;
  const view = full ? resultView(full.payload, full.selfId) : null;
  const outcome = newMatch ? null : (live?.outcome ?? null);
  const minimal = view === null && live !== null && outcome !== null && outcome.kind !== 'aborted';
  const show = view !== null || minimal;
  useDocumentTitle(full?.payload.mode === 'BATTLE_ROOM' ? t('room.result.title') : t('results.title'));

  useEffect(() => {
    // The rematch (or any new match) started: straight to it.
    if (newMatch) navigate('/match', { replace: true });
  }, [newMatch]);

  useEffect(() => {
    if (show || newMatch) return;
    // An abort that lands here (Leave before the first reveal): Home shows the notice.
    if (outcome?.kind === 'aborted') announce(t('match.aborted'));
    navigate('/', { replace: true });
  }, [show, newMatch]);

  if (newMatch) return null;
  if (view && full) return <FullResults key={full.payload.matchId} full={full} view={view} />;
  if (minimal) return <MinimalResults live={live} />;
  return null;
}

function FullResults({ full, view }: { full: FullResult; view: ResultView }) {
  const { t } = useTranslation();
  const reduced = useReducedEffects();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const matchId = full.payload.matchId;
  const room = full.payload.mode === 'BATTLE_ROOM';
  // The win takeovers are a later piece for rooms: a room opens straight on the settled view.
  const eligible = !room && full.liveArrival && view.kind === 'win' && !view.self.forfeited;
  const [takeover, setTakeover] = useState(false);
  const guardUntil = useRef(0);

  // Decided once per match, before paint: a live win plays the takeover once, never again.
  useLayoutEffect(() => {
    if (eligible && !takeoverPlayed.has(matchId)) {
      takeoverPlayed.add(matchId);
      setTakeover(true);
    }
  }, [matchId]);

  // Settled: focus the heading, whose name carries the result.
  useEffect(() => {
    if (!takeover) headingRef.current?.focus();
  }, [takeover]);

  const onTakeoverDone = () => {
    guardUntil.current = performance.now() + motion.resultsTapGuard;
    setTakeover(false);
  };

  // For `resultsTapGuard` ms after the takeover collapses, the results ignore taps.
  const guard = (event: SyntheticEvent) => {
    if (performance.now() < guardUntil.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // Guest or registered (Story 2.4): decided from what the session says now for a live arrival, from the
  // stored flag after a reload. While the session is booting nothing is shown, so nothing flashes.
  const status = useSession((s) => s.status);
  // Fixed when the results open: a later change of session (expiry, sign-out) must not turn her own match
  // into a guest one. A live arrival reads the flag the connection stored at MATCH_ENDED; an entry with no
  // flag falls back to the session at that moment.
  const [playedAsGuest] = useState(() => {
    if (full.guest !== null) return full.guest;
    const kept = lastResult.load();
    if (kept && kept.matchId === matchId && kept.guest !== null) return kept.guest;
    return session.store.getState().status !== 'registered';
  });
  // Quick Match only: the copy talks about a Quick Match rating, so no other mode gets it.
  const showPrompt = playedAsGuest && status === 'guest' && full.payload.mode === 'QUICK';
  const signedInAfterGuest = playedAsGuest && status === 'registered';

  // Her rating change (Story 2.6): only for a registered player's own rated match; a guest's results and an
  // unrated match show nothing at all.
  const ratedForHer = status === 'registered' && !playedAsGuest && full.payload.questionSource === 'BANK';
  const delta = useMatchDelta(matchId, ratedForHer);
  // The heading's name already carries the rating, but a changed name is not announced: say it once, politely.
  const deltaValue = delta.status === 'ready' ? delta.delta : null;
  useEffect(() => {
    if (deltaValue !== null) announce(t('results.rating.sr', { delta: deltaValue }));
  }, [deltaValue]);

  const you = view.self.score;
  const them = view.rival?.score ?? 0;
  const total = full.payload.participants.length;
  const baseHeading = room
    ? t('room.result.heading', { place: view.self.placement, total, score: you })
    : t(`results.heading.${view.kind}`, { you, them });
  // The accessible name gains the rating once it is known ("You won, 3,140 to 2,980, rating +24").
  const named = delta.status === 'ready' ? `${baseHeading}, ${t('results.rating.sr', { delta: delta.delta })}` : baseHeading;
  // A Topic Duel names its mode and topic under the result line ("Topic Duel · Kerala History"), and in the heading's name.
  const topic = full.payload.topic;
  const topicLabel = topic ? `${room ? t('room.result.title') : t('mode.topicDuel.title')} · ${topic.name}` : undefined;
  const heading = topicLabel ? `${named}, ${topicLabel}` : named;
  // Questions she marked during the live reveals open expanded with the note ready (Story 3.5).
  const [marks] = useState(() => new Set(lastResult.loadMarks(matchId)));
  const answers = full.payload.breakdown.find((b) => b.participantId === full.selfId)?.answers ?? [];

  return (
    <>
      <div
        data-testid="results-surface"
        inert={takeover}
        aria-hidden={takeover ? true : undefined}
        onClickCapture={guard}
        onPointerDownCapture={guard}
      >
        <PageColumn className="py-6">
          <main className="flex flex-col gap-4">
            <h1 ref={headingRef} tabIndex={-1} className="font-title text-title">
              <span aria-hidden="true">{t('results.title')}</span>
              <span className="sr-only">{heading}</span>
            </h1>
            <ResultsBand
              view={view}
              delta={ratedForHer ? delta : undefined}
              topicLabel={topicLabel}
              room={room ? { total } : undefined}
            />
            {room ? (
              <>
                <Podium participants={full.payload.participants} selfId={full.selfId} />
                <RoomStandings participants={full.payload.participants} selfId={full.selfId} />
              </>
            ) : null}
            {showPrompt ? <GuestResultsPrompt view={view} /> : null}
            {signedInAfterGuest ? (
              <p data-testid="guest-match-note" className="text-caption text-muted">
                {t('results.guestNote')}
              </p>
            ) : null}
            {view.self.forfeited ? (
              <p data-testid="notice-forfeited" className="text-body text-muted">
                {full.payload.mode === 'BATTLE_ROOM'
                  ? t('match.forfeited')
                  : t('match.forfeitedOneVsOne', {
                      name: full.payload.participants.find((p) => p.participantId !== full.selfId)?.displayName ?? '',
                    })}
              </p>
            ) : null}
            <DotStrip answers={answers} />
            <ol data-testid="breakdown" className="flex flex-col gap-2">
              {full.payload.questions.map((question, i) => {
                const answer = answers[i];
                return answer ? (
                  <BreakdownRow
                    key={`${i}:${question.questionId}`}
                    index={i}
                    question={question}
                    answer={answer}
                    practise={ratedForHer}
                    report={{
                      matchId,
                      questionSource: full.payload.questionSource,
                      marked: marks.has(lastResult.markKey(question.questionId, question.version)),
                    }}
                  />
                ) : null;
              })}
            </ol>
          </main>
          {room ? (
            <HomeActions />
          ) : signedInAfterGuest ? (
            <PlayAgainActions />
          ) : (
            <RematchActions matchId={matchId} rivalName={view.rival?.displayName ?? ''} />
          )}
        </PageColumn>
      </div>
      {takeover ? (
        <WinTakeover
          selfScore={you}
          opponent={view.rival ? { name: view.rival.displayName, score: view.rival.score } : null}
          reduced={reduced}
          delta={delta.status === 'ready' ? delta.delta : null}
          onDone={onTakeoverDone}
        />
      ) : null}
    </>
  );
}

/** A Battle Room's results bar (Story 5.5): Home only. Play again is the host's, in Story 5.6; Share is Epic 7. */
function HomeActions() {
  const { t } = useTranslation();
  return (
    <ActionBar>
      <Button variant="secondary" data-testid="home-button" onClick={() => navigate('/')}>
        {t('common.home')}
      </Button>
    </ActionBar>
  );
}

/**
 * The results bar for a player who signed in after a guest match (Story 2.4): the guest's post-match
 * window ended with the guest session, so there is no Rematch. "Play again" starts a new Quick Match as
 * her registered self; Home stays.
 */
function PlayAgainActions() {
  const { t } = useTranslation();
  return (
    <ActionBar>
      <Button data-testid="play-again-button" onClick={() => navigate('/matchmaking')}>
        {t('results.playAgain')}
      </Button>
      <Button variant="secondary" onClick={() => navigate('/')}>
        {t('common.home')}
      </Button>
    </ActionBar>
  );
}

/**
 * The rematch half of the results bar (Story 1.10 part 2). Every state comes from the store's
 * `rematch`, which only the server's messages (and her own sends) change:
 * - Rematch (primary), or "Accept rematch" when the opponent asked first; while her request is
 *   on its way the button is busy;
 * - while her request is pending, the waiting card (name, seconds left, Cancel);
 * - after a revert, a one-line note, announced politely once; Rematch can be sent again.
 * Home (secondary) is always there. Home, or leaving `/results` any other way, withdraws a pending
 * request.
 */
function RematchActions({ matchId, rivalName }: { matchId: string; rivalName: string }) {
  const { t } = useTranslation();
  const stored = useLiveGame((s) => s.rematch);
  const clockOffsetMs = useLiveGame((s) => s.clockOffsetMs);
  const rematch = stored?.matchId === matchId ? stored : null;
  const state = rematch?.state ?? 'idle';
  const note = rematch?.note ? t(`rematch.note.${rematch.note}`, { name: rivalName }) : null;

  // Each revert is a new store value: its note is announced once.
  useEffect(() => {
    if (note) announce(note);
  }, [rematch]);

  const incoming = state === 'incoming';
  useEffect(() => {
    if (incoming) announce(t('rematch.accept'));
  }, [incoming]);

  // The swap between the button and the waiting card removes the focused control: keep focus
  // on whichever of them is there now (never on the first render).
  const waiting = state === 'waiting';
  const swapped = useRef(false);
  useEffect(() => {
    if (!swapped.current) {
      swapped.current = true;
      return;
    }
    const focused = document.activeElement;
    if (focused === null || focused === document.body) {
      document.querySelector<HTMLElement>('[data-testid="rematch-cancel"], [data-testid="rematch-button"]')?.focus();
    }
  }, [waiting]);

  // Leaving /results (Home, Back, a link) withdraws a pending request.
  useEffect(() => () => void cancelRematch(), []);

  const onRematch = () => {
    if (state === 'starting') return;
    requestRematch(matchId);
  };
  const onHome = () => {
    cancelRematch();
    navigate('/');
  };

  return (
    <ActionBar
      note={
        note ? (
          <p data-testid="rematch-note" className="text-body text-muted">
            {note}
            {rematch?.note === 'topicUnavailable' ? (
              <>
                {' '}
                <Link to="/play/topics?for=duel" className="font-semibold underline">
                  {t('title.topics')}
                </Link>
              </>
            ) : null}
          </p>
        ) : null
      }
    >
      {state === 'waiting' && rematch?.expiresAt ? (
        <RematchCard
          name={rivalName}
          expiresAt={rematch.expiresAt}
          clockOffsetMs={clockOffsetMs}
          onCancel={() => cancelRematch()}
        />
      ) : (
        <Button data-testid="rematch-button" aria-busy={state === 'starting' ? true : undefined} onClick={onRematch}>
          {incoming ? t('rematch.accept') : t('rematch.request')}
        </Button>
      )}
      <Button variant="secondary" onClick={onHome}>
        {t('common.home')}
      </Button>
    </ActionBar>
  );
}

/**
 * The fixed results action bar, on card with a hairline top border like the tab bar. An in-flow
 * spacer as tall as the bar keeps the last row clear of it. Its children wrap to full width when
 * they don't fit (the waiting card keeps a minimum width, so it stacks above Home on a narrow
 * phone). A `note` line sits above them.
 */
function ActionBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
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
        data-testid="results-actions"
        className="fixed inset-x-[0] bottom-[0] z-10 border-t border-hairline bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto w-full max-w-[480px] px-gutter-card py-3">
          {note}
          <div className={`flex flex-wrap gap-3 [&>*]:flex-1 ${note ? 'mt-2' : ''}`}>{children}</div>
        </div>
      </div>
    </>
  );
}

/**
 * The minimal view (Story 1.9), kept as the fallback while MATCH_ENDED has not arrived: each
 * participant's name and score from the store's `outcome`, her own row marked, and Home. When
 * she forfeited or left, a line says the match is still going.
 */
function MinimalResults({ live }: { live: LiveMatch }) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const outcome = live.outcome!;
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const names = new Map(live.participants.map((p) => [p.participantId, p]));
  const stillGoing = outcome.kind === 'forfeited' || outcome.kind === 'left';
  return (
    <PageColumn className="py-6">
      <main className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="font-title text-title">
          {t('results.title')}
        </h1>
        {outcome.kind === 'forfeited' ? (
          <p data-testid="notice-forfeited" className="text-body text-muted">
            {live.participants.length === 2
              ? t('match.forfeitedOneVsOne', {
                  name: live.participants.find((p) => p.participantId !== live.selfParticipantId)?.displayName ?? '',
                })
              : t('match.forfeited')}
          </p>
        ) : null}
        {stillGoing ? (
          <p data-testid="results-pending" className="text-body text-muted">
            {t('results.pending')}
          </p>
        ) : null}
        <ol className="flex flex-col gap-2">
          {outcome.scores.map((row) => {
            const participant = names.get(row.participantId);
            const self = row.participantId === live.selfParticipantId;
            return (
              <li
                key={row.participantId}
                data-testid={self ? 'result-self' : 'result-row'}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-3 ${
                  self ? 'border-[1.5px] border-ink bg-card' : 'border border-hairline bg-card'
                }`}
              >
                <span className="inline-flex items-center gap-2 text-body">
                  {self ? (
                    <span className="font-bold text-ink">{t('match.you')}</span>
                  ) : (
                    <span className="text-ink">
                      <Lang>{participant?.displayName ?? ''}</Lang>
                    </span>
                  )}{' '}
                  {participant?.kind === 'BOT' ? <BotBadge /> : null}
                </span>
                <span className="font-score text-score tabular-nums text-ink">{formatNumber(row.score)}</span>
              </li>
            );
          })}
        </ol>
        <div>
          <Button onClick={() => navigate('/')}>{t('common.home')}</Button>
        </div>
      </main>
    </PageColumn>
  );
}
