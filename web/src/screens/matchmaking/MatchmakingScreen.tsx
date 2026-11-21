import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BotBadge } from '../../design/BotBadge.tsx';
import { Button } from '../../design/Button.tsx';
import { fontsReady } from '../../design/fonts.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { useReducedEffects } from '../../motion/reduceEffects.ts';
import {
  cancelMatchmaking,
  joinQuickMatch,
  liveGameStore,
  useLiveGame,
  type LiveProblem,
} from '../../realtime/liveGameStore.ts';
import { announce } from '../../shell/announce.ts';
import { navigate } from '../../shell/router.ts';
import { useHideTabBar } from '../../shell/useHideTabBar.ts';
import { preloadLiveMatch } from '../preload.ts';
import { OpponentNames, opponentsOf } from '../match/opponents.tsx';

/** How long the found state stays up (with the BOT badge readable) before the match opens. */
export const FOUND_HOLD_MS = 1000;

function problemKey(problem: LiveProblem): MessageKey {
  switch (problem.kind) {
    case 'connection':
      return 'matchmaking.connectionFailed';
    case 'draining':
      return 'matchmaking.draining';
    case 'alreadyInMatch':
      return problem.matchId ? 'matchmaking.alreadyInMatch' : 'matchmaking.alreadySearching';
    default:
      return 'matchmaking.failed';
  }
}

/** Seconds since `since` (a Date.now() value), ticking once a second while `active`. */
function useElapsedSeconds(since: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, since]);
  return Math.max(0, Math.floor((now - since) / 1000));
}

/**
 * `/matchmaking` (Story 1.6): joins the Quick Match queue on mount. Searching shows "Finding an
 * opponent…" with an animated indicator (static text and an elapsed count under reduced
 * effects) and Cancel. After MATCH_FOUND it shows who joined ("Minnal Bot joined" + BOT badge,
 * announced once) and opens `/match` after max(fonts ready, 1 s). Failures show an inline alert.
 * Leaving the route while searching cancels. No tab bar.
 *
 * Story 4.2: given a `topicId` it joins that Topic Duel queue instead, shows `topicName` under the
 * heading, and returns to `exitTo` (the picker) rather than Home when cancelled.
 */
export function MatchmakingScreen({
  topicId,
  topicName,
  exitTo = '/',
}: {
  topicId?: string;
  topicName?: string;
  exitTo?: string;
} = {}) {
  const { t } = useTranslation();
  useDocumentTitle(t('title.matchmaking'));
  useHideTabBar();
  const reduced = useReducedEffects();
  const phase = useLiveGame((s) => s.phase);
  const match = useLiveGame((s) => s.match);
  const problem = useLiveGame((s) => s.problem);

  // The live match opens next: fetch its chunk now so match start never waits on the network.
  useEffect(preloadLiveMatch, []);

  const [joinedAt, setJoinedAt] = useState(() => Date.now());
  /** The match in the store before this visit's join: a stale one must not open /match. */
  const staleMatch = useRef(liveGameStore.getState().match);
  const cancelRequested = useRef(false);

  // Before paint, so a stale phase from the last visit never shows.
  useLayoutEffect(() => {
    staleMatch.current = liveGameStore.getState().match;
    joinQuickMatch(topicId);
    return () => {
      if (liveGameStore.getState().phase === 'searching') cancelMatchmaking();
    };
  }, []);

  const found = phase === 'found' && match !== null && match !== staleMatch.current ? match : null;
  const withBot = found ? opponentsOf(found).some((p) => p.kind === 'BOT') : false;
  const searching = phase === 'searching' || phase === 'cancelling';
  const elapsed = useElapsedSeconds(joinedAt, searching && reduced);

  useEffect(() => {
    if (phase === 'cancelled' && cancelRequested.current) navigate(exitTo);
  }, [phase]);

  useEffect(() => {
    if (!found) return;
    if (withBot) announce(t('matchmaking.botJoined'));
    let live = true;
    const hold = new Promise<void>((resolve) => setTimeout(resolve, FOUND_HOLD_MS));
    void Promise.all([fontsReady(), hold]).then(() => {
      if (live) navigate('/match', { replace: true });
    });
    return () => {
      live = false;
    };
    // Once per match: `t` and `withBot` follow from it.
  }, [found]);

  const onCancel = () => {
    cancelRequested.current = true;
    if (cancelMatchmaking() !== 'sent') navigate(exitTo);
  };

  const onRetry = () => {
    setJoinedAt(Date.now());
    joinQuickMatch(topicId);
  };

  let heading: ReactNode = t('matchmaking.searching');
  if (found) {
    heading = withBot ? (
      t('matchmaking.botJoined')
    ) : (
      <>
        <span>{t('match.foundVs')}</span> <OpponentNames match={found} />
      </>
    );
  }

  return (
    <PageColumn className="justify-center py-6">
      <main className="flex flex-col items-start gap-3">
        <h1 tabIndex={-1} className="flex flex-wrap items-center gap-2 font-title text-title">
          {heading}
          {found && withBot ? <BotBadge /> : null}
        </h1>
        {topicName ? <p data-testid="matchmaking-topic" className="text-body text-muted">{topicName}</p> : null}

        {searching ? (
          reduced ? (
            <p data-testid="matchmaking-elapsed">{t('matchmaking.elapsed', { seconds: elapsed })}</p>
          ) : (
            <SearchingIndicator />
          )
        ) : null}

        {phase === 'failed' && problem ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p>{t(problemKey(problem))}</p>
            {problem.kind === 'alreadyInMatch' ? (
              problem.matchId ? (
                <Button onClick={() => navigate(`/match?matchId=${encodeURIComponent(problem.matchId!)}`)}>{t('matchmaking.returnToMatch')}</Button>
              ) : null
            ) : (
              <Button onClick={onRetry}>{t('common.retry')}</Button>
            )}
          </div>
        ) : null}

        {found ? null : (
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </main>
    </PageColumn>
  );
}

/** Three dots pulsing in turn (opacity only); hidden from assistive tech, the heading says it all. */
function SearchingIndicator() {
  return (
    <span aria-hidden="true" data-testid="matchmaking-indicator" className="flex gap-2 py-2">
      <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-ink [animation-delay:200ms]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-ink [animation-delay:400ms]" />
    </span>
  );
}
