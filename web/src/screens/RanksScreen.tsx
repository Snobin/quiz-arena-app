import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { session, useSession } from '../auth/session.ts';
import { Button } from '../design/Button.tsx';
import { PageColumn } from '../design/PageColumn.tsx';
import type { MessageKey } from '../i18n/index.ts';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { useProfile } from '../profile/profileStore.ts';
import { EmptyBoard } from '../ranks/EmptyBoard.tsx';
import { boardKey, fetchBoard, MODES, PAGE, PERIODS, type BoardEntry } from '../ranks/leaderboardApi.ts';
import { PinnedRow } from '../ranks/PinnedRow.tsx';
import { RankRow } from '../ranks/RankRow.tsx';
import { selectBoard, useRanksSelection } from '../ranks/ranksSelection.ts';
import { SectionError } from '../ratings/RatingTrio.tsx';
import { type Mode } from '../ratings/ratingsApi.ts';
import { SignInNudge } from './home/SignInNudge.tsx';

const MODE_LABEL: Record<Mode, MessageKey> = {
  QUICK: 'play.quickMatch',
  TOPIC_DUEL: 'mode.topicDuel.title',
  BATTLE_ROOM: 'mode.battleRoom.title',
};

/** The segmented control's look: a card track, active ink fill with a white label (UX-DR57). */
const SEGMENT = 'hit-target min-h-target-min flex-1 px-2 py-2 text-body font-semibold';

/**
 * The Ranks tab (Story 2.7 part B, UX-DR15, UX-DR23, UX-DR57 to UX-DR61): a mode switcher over period tabs, a list
 * header naming the measure, the board's rows (top 50, "Show more" for the next 50), her own row pinned when it is out
 * of view, an empty card for a board with no rows, and one Sign-in nudge for a guest. Mode and period are kept when she
 * leaves the tab; the shell keeps the scroll position.
 */
export function RanksScreen() {
  const { t } = useTranslation();
  useDocumentTitle(t('tab.ranks'));
  const { mode, period } = useRanksSelection();
  const registered = useSession((s) => s.status === 'registered');
  const name = useSession((s) => s.name);
  const district = useProfile((s) => s.profile?.district ?? '');
  // "Show more" belongs to the board it was pressed on (derived, so a mode or period change never inherits it).
  const boardId = `${mode}|${period}`;
  const [moreFor, setMoreFor] = useState('');
  const more = moreFor === boardId;

  const first = useQuery({
    queryKey: boardKey(registered, mode, period, 0),
    queryFn: ({ signal }) => fetchBoard(mode, period, 0, PAGE, signal),
    staleTime: 30_000,
    retry: false,
  });
  const second = useQuery({
    queryKey: boardKey(registered, mode, period, PAGE),
    queryFn: ({ signal }) => fetchBoard(mode, period, PAGE, PAGE, signal),
    enabled: more,
    staleTime: 30_000,
    retry: false,
  });
  // One row per player even if ranks shifted between the two page requests.
  const seen = new Set<string>();
  const entries: BoardEntry[] = [...(first.data?.entries ?? []), ...(second.data?.entries ?? [])].filter((e) => !seen.has(e.userId) && seen.add(e.userId));
  const gained = period !== 'alltime';
  const me = registered ? first.data?.me : undefined;
  const userId = registered ? session.userId() : null;
  const ownIndex = userId ? entries.findIndex((e) => e.userId === userId) : -1;

  // Her row is pinned unless it is on screen. Without IntersectionObserver (old browsers, tests) a row that is in the
  // list counts as visible, and a position beyond the loaded rows (or the top 100) is always pinned.
  const [ownVisible, setOwnVisible] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const ownRef = useCallback((element: HTMLLIElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (element && typeof IntersectionObserver !== 'undefined') {
      observer.current = new IntersectionObserver((records) => setOwnVisible(records[records.length - 1]?.isIntersecting ?? true));
      observer.current.observe(element);
    }
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  useEffect(() => setOwnVisible(true), [boardId, ownIndex]);
  const pinned = Boolean(me) && (ownIndex === -1 || !ownVisible);

  // Arrow keys move the selection and focus along a radio group or tab list (roving tabindex).
  const arrows = <T,>(items: readonly T[], current: T, choose: (item: T) => void) => (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const container = event.currentTarget;
    const next = items[(items.indexOf(current) + step + items.length) % items.length]!;
    choose(next);
    requestAnimationFrame(() => container.querySelector<HTMLElement>('[tabindex="0"]')?.focus());
  };

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('tab.ranks')}
        </h1>

        <div
          role="radiogroup"
          aria-label={t('ranks.modes')}
          onKeyDown={arrows(MODES, mode, (m) => selectBoard(m, period))}
          className="flex rounded-lg border border-hairline bg-card"
        >
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={m === mode}
              tabIndex={m === mode ? 0 : -1}
              onClick={() => selectBoard(m, period)}
              className={`${SEGMENT} first:rounded-l-lg last:rounded-r-lg ${m === mode ? 'bg-band text-on-band' : 'text-ink'}`}
            >
              {t(MODE_LABEL[m])}
            </button>
          ))}
        </div>

        <div role="tablist" aria-label={t('ranks.periods')} onKeyDown={arrows(PERIODS, period, (p) => selectBoard(mode, p))} className="flex">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={p === period}
              aria-controls="ranks-panel"
              id={`ranks-tab-${p}`}
              tabIndex={p === period ? 0 : -1}
              onClick={() => selectBoard(mode, p)}
              className={`${SEGMENT} ${p === period ? 'border-b-2 border-ink font-bold text-ink' : 'border-b-2 border-transparent text-muted'}`}
            >
              {t(`ranks.period.${p}` as MessageKey)}
            </button>
          ))}
        </div>

        <section role="tabpanel" id="ranks-panel" aria-labelledby={`ranks-tab-${period}`} className="flex flex-col gap-2">
          <h2 data-testid="ranks-header" className="text-caption font-semibold text-muted">
            {t(`ranks.header.${period}` as MessageKey)}
          </h2>
          {first.isError ? (
            <SectionError error={first.error} onRetry={() => void first.refetch()} />
          ) : !first.data ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : entries.length === 0 ? (
            <EmptyBoard mode={mode} period={period} onSeeAll={() => selectBoard(mode, 'alltime')} />
          ) : (
            <>
              <ol data-testid="board" className="flex flex-col gap-2">
                {entries.map((entry, i) => (
                  <RankRow key={entry.userId} entry={entry} gained={gained} own={i === ownIndex} rowRef={i === ownIndex ? ownRef : undefined} />
                ))}
              </ol>
              {second.isError ? <SectionError error={second.error} onRetry={() => void second.refetch()} /> : null}
              {!second.data && first.data.entries.length === PAGE ? (
                <Button variant="secondary" aria-busy={second.isFetching ? true : undefined} onClick={() => setMoreFor(boardId)}>
                  {second.isFetching ? t('common.loading') : t('ranks.showMore')}
                </Button>
              ) : null}
            </>
          )}
        </section>

        {!registered ? <SignInNudge returnTo="/ranks" /> : null}
        {pinned ? <div aria-hidden="true" className="h-[96px] shrink-0" /> : null}
      </main>
      {pinned && me ? <PinnedRow rank={me.rank} value={me.value} gained={gained} name={name ?? ''} district={district} /> : null}
    </PageColumn>
  );
}
