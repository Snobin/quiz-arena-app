import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import type { LiveMatch } from '../../realtime/liveGameStore.ts';
import '../rooms/roomCatalogue.ts';

/**
 * The Battle Room's parts of the live screen (Story 5.4): the start countdown, a compact header, the plain standings. They sit in the match chunk with the screen; the room strings they use come from the rooms
 * catalogue, so the entry chunk carries none of them. The richer scoreboard (top 8, answered meter, rank arrows, overtake)
 * is a later deliverable: here every participant is one plain row.
 */

/** The countdown starts at 3 and holds there through the 0.5 s subscription buffer. */
export const COUNTDOWN_FROM = 3;
/** The digits are re-read from the server clock this often. */
export const COUNTDOWN_TICK_MS = 100;
/** `document.fonts.ready` is waited for at most this long during the countdown. */
export const FONTS_WAIT_MS = 3_000;

/** The digit to show now, from `firstQuestionAt` and the server clock offset (never a local timer): 3, 2, 1, then null. */
export function countdownDigit(firstQuestionAt: string, clockOffsetMs: number, nowMs: number): number | null {
  const remaining = Date.parse(firstQuestionAt) - (nowMs + clockOffsetMs);
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  return Math.min(COUNTDOWN_FROM, Math.ceil(remaining / 1000));
}

/** Whether the fonts are ready (capped): the live face is `font-display: optional`, so Q1 must not meet a late swap. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (!cancelled) setReady(true);
    };
    const timer = setTimeout(done, FONTS_WAIT_MS);
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (fonts?.ready) void fonts.ready.then(done, done);
    else done();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return ready;
}

/** 3-2-1 in countdown type, ink on paper, for every player alike; no control (the host has none). */
export function Countdown({ firstQuestionAt, clockOffsetMs }: { firstQuestionAt: string; clockOffsetMs: number }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const fontsReady = useFontsReady();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const digit = countdownDigit(firstQuestionAt, clockOffsetMs, now);
  if (digit === null) return null;
  return (
    <div className="mt-6 flex flex-col items-center">
      <p
        data-testid="countdown"
        data-fonts-ready={fontsReady}
        aria-hidden="true"
        className="font-score text-countdown tabular-nums text-ink"
      >
        {formatNumber(digit)}
      </p>
      <p className="sr-only">{t('room.countdown.label', { n: digit })}</p>
    </div>
  );
}

type Row = { participantId: string; name: string; score: number; rank: number };

/** Plain ranking by running total: equal totals share a rank (1, 1, 3). The order of equal totals is the match's. */
export function rankRows(participants: { participantId: string; displayName: string }[], totals: Record<string, number>): Row[] {
  const scored = participants.map((p) => ({ participantId: p.participantId, name: p.displayName, score: totals[p.participantId] ?? 0 }));
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  return sorted.map((row) => ({ ...row, rank: 1 + sorted.filter((other) => other.score > row.score).length }));
}

/** A compact header for a room: her own total and the Leave button (the standings follow the question). */
export function RoomHeader({ live, trailing }: { live: LiveMatch; trailing?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="room-header"
      className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-card px-3 py-3"
    >
      <div className="flex flex-col">
        <span className="text-label font-bold text-ink">{t('match.you')}</span>
        <span data-testid="self-total" className="font-score text-score tabular-nums text-ink">
          {formatNumber(live.totals[live.selfParticipantId] ?? 0)}
        </span>
      </div>
      {trailing}
    </div>
  );
}

/**
 * Every participant, ranked by running total, with who has answered the open question (a dot: never what). Her own row
 * reads "You". The glyphs are `aria-hidden`; each row's name carries rank, name, score and the answered state; the list is
 * never a live region.
 */
export function RoomStandings({ live }: { live: LiveMatch }) {
  const { t } = useTranslation();
  const revealed = live.reveal !== null && live.reveal.questionIndex === live.question?.questionIndex;
  const showAnswered = live.question !== null && !revealed && live.phase !== 'ended';
  const rows = rankRows(live.participants, live.totals);
  return (
    <section aria-labelledby="room-standings-heading" className="mt-6 flex flex-col gap-2">
      <h2 id="room-standings-heading" className="text-label font-bold text-muted">
        {t('room.standings.heading')}
      </h2>
      <ol data-testid="room-standings" className="flex flex-col gap-1">
        {rows.map((row) => {
          const self = row.participantId === live.selfParticipantId;
          const left = live.forfeited.includes(row.participantId);
          const answered = live.answered.includes(row.participantId);
          const status = left ? t('match.leftStatus') : answered ? t('match.answered') : t('room.standings.notAnswered');
          const name = self ? t('match.you') : row.name;
          return (
            <li
              key={row.participantId}
              data-testid="room-row"
              aria-label={t('room.standings.row', { rank: row.rank, name, score: row.score, status: showAnswered || left ? status : '' })}
              className={`flex min-h-[47px] items-center gap-3 rounded-md border border-hairline bg-card px-3 py-2 ${left ? 'text-muted' : 'text-ink'}`}
            >
              <span aria-hidden="true" className="w-8 text-label tabular-nums">
                {formatNumber(row.rank)}
              </span>
              <span aria-hidden="true" className={`min-w-[0] flex-1 break-words text-body ${self ? 'font-bold' : ''}`}>
                {self ? name : <Lang>{name}</Lang>}
              </span>
              {showAnswered && !left ? (
                <span aria-hidden="true" data-testid="answered-dot">
                  {answered ? '●' : '○'}
                </span>
              ) : null}
              <span aria-hidden="true" className="font-score text-score tabular-nums">
                {formatNumber(row.score)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
