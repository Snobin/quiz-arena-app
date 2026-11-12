import { useTranslation } from 'react-i18next';
import { BotBadge } from '../../design/BotBadge.tsx';
import { formatNumber } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import type { LiveMatch } from '../../realtime/liveGameStore.ts';
import { opponentsOf } from './opponents.tsx';

/**
 * The score strip: You (bold ink) and your total on the left; each opponent on the right with
 * the unchanged name, the BOT badge for a bot, a "thinking" → "answered" status (only from
 * SCOREBOARD, never what they picked) and their total. Totals are the last reveal's values.
 * The status shows only while a question is open: not in the lead-in, over a reveal, or after the end.
 */
export function ScoreStrip({ live }: { live: LiveMatch }) {
  const { t } = useTranslation();
  const revealed = live.reveal !== null && live.reveal.questionIndex === live.question?.questionIndex;
  const showStatus = live.question !== null && !revealed && live.phase !== 'ended';
  return (
    <div
      data-testid="score-strip"
      className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-card px-3 py-3"
    >
      <div className="flex flex-col">
        <span className="text-label font-bold text-ink">{t('match.you')}</span>
        <span data-testid="self-total" className="font-score text-score tabular-nums text-ink">
          {formatNumber(live.totals[live.selfParticipantId] ?? 0)}
        </span>
      </div>
      {opponentsOf(live).map((opponent) => (
        <div key={opponent.participantId} className="flex flex-wrap items-center justify-end gap-3">
          {showStatus ? (
            <span data-testid="opponent-status" className="text-label text-muted">
              {live.answered.includes(opponent.participantId) ? t('match.answered') : t('match.thinking')}
            </span>
          ) : null}
          <div className="flex flex-col items-end">
            <span className="inline-flex items-center gap-2 text-label text-muted">
              <Lang>{opponent.displayName}</Lang> {opponent.kind === 'BOT' ? <BotBadge /> : null}
            </span>
            <span data-testid="opponent-total" className="font-score text-score tabular-nums text-muted">
              {formatNumber(live.totals[opponent.participantId] ?? 0)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
