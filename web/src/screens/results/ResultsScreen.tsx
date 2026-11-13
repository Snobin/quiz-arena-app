import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BotBadge } from '../../design/BotBadge.tsx';
import { Button } from '../../design/Button.tsx';
import { PageColumn } from '../../design/PageColumn.tsx';
import { motion } from '../../design/tokens.ts';
import { formatNumber } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { useReducedEffects } from '../../motion/reduceEffects.ts';
import * as lastResult from '../../realtime/lastResult.ts';
import { useLiveGame, type LiveMatch } from '../../realtime/liveGameStore.ts';
import type { MatchEndedPayload } from '../../realtime/protocol.ts';
import { announce } from '../../shell/announce.ts';
import { navigate } from '../../shell/router.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';
import { BreakdownRow } from './BreakdownRow.tsx';
import { DotStrip } from './DotStrip.tsx';
import { resultView, type ResultView } from './outcome.ts';
import { ResultsBand } from './ResultsBand.tsx';
import { WinTakeover } from './WinTakeover.tsx';

/** Matches whose takeover has played in this page session: it never replays (Back, re-render). */
const takeoverPlayed = new Set<string>();

type FullResult = { payload: MatchEndedPayload; selfId: string; liveArrival: boolean };

/**
 * `/results` (Story 1.10). The full screen comes from MATCH_ENDED: in the store when it arrived
 * in this page session, else from `sessionStorage` after a reload (`lastResult.ts`). It shows
 * the win takeover (live arrivals only, never on a reload), the loss or draw band, the dot strip,
 * the breakdown and a fixed Home bar. Every placement, correctness and point is the server's.
 *
 * Without MATCH_ENDED yet (she forfeited or left while the match goes on, or the match settled
 * with no MATCH_ENDED) it shows the minimal view of Story 1.9 from the store's `outcome`, and
 * upgrades in place when MATCH_ENDED arrives. With nothing stored or held (or a corrupt entry,
 * or an abort) it goes Home.
 */
export function ResultsScreen() {
  const { t } = useTranslation();
  useHideTabBar();
  useDocumentTitle(t('results.title'));
  const live = useLiveGame((s) => s.live);
  const [stored] = useState(() => lastResult.load());

  let full: FullResult | null = null;
  if (live?.ended && live.ended.matchId === live.matchId) {
    full = { payload: live.ended, selfId: live.selfParticipantId, liveArrival: true };
  } else if (stored && (live === null || stored.matchId === live.matchId)) {
    full = { payload: stored.payload, selfId: stored.selfId, liveArrival: false };
  }
  const view = full ? resultView(full.payload, full.selfId) : null;
  const outcome = live?.outcome ?? null;
  const minimal = view === null && live !== null && outcome !== null && outcome.kind !== 'aborted';
  const show = view !== null || minimal;

  useEffect(() => {
    if (show) return;
    // An abort that lands here (Leave before the first reveal): Home shows the notice.
    if (outcome?.kind === 'aborted') announce(t('match.aborted'));
    navigate('/', { replace: true });
  }, [show]);

  if (view && full) return <FullResults key={full.payload.matchId} full={full} view={view} />;
  if (minimal) return <MinimalResults live={live} />;
  return null;
}

function FullResults({ full, view }: { full: FullResult; view: ResultView }) {
  const { t } = useTranslation();
  const reduced = useReducedEffects();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const matchId = full.payload.matchId;
  const eligible = full.liveArrival && view.kind === 'win' && !view.self.forfeited;
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

  const you = view.self.score;
  const them = view.rival?.score ?? 0;
  const heading = t(`results.heading.${view.kind}`, { you, them });
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
            <ResultsBand view={view} />
            {view.self.forfeited ? (
              <p data-testid="notice-forfeited" className="text-body text-muted">
                {t('match.forfeited')}
              </p>
            ) : null}
            <DotStrip answers={answers} />
            <ol data-testid="breakdown" className="flex flex-col gap-2">
              {full.payload.questions.map((question, i) => {
                const answer = answers[i];
                return answer ? <BreakdownRow key={`${i}:${question.questionId}`} index={i} question={question} answer={answer} /> : null;
              })}
            </ol>
          </main>
          <ActionBar>
            <Button onClick={() => navigate('/')}>{t('common.home')}</Button>
          </ActionBar>
        </PageColumn>
      </div>
      {takeover ? (
        <WinTakeover
          selfScore={you}
          opponent={view.rival ? { name: view.rival.displayName, score: view.rival.score } : null}
          reduced={reduced}
          onDone={onTakeoverDone}
        />
      ) : null}
    </>
  );
}

/**
 * The fixed results action bar (Home only until rematch, Story 1.10 part 2), on card with a
 * hairline top border like the tab bar. An in-flow spacer as tall as the bar keeps the last row
 * clear of it. Buttons wrap to full width when they don't fit.
 */
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
        data-testid="results-actions"
        className="fixed inset-x-[0] bottom-[0] z-10 border-t border-hairline bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex w-full max-w-[480px] flex-wrap gap-3 px-gutter-card py-3 [&>*]:flex-1">{children}</div>
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
            {t('match.forfeited')}
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
