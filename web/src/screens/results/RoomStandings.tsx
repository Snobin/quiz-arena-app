import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import type { ResultParticipant } from '../../realtime/protocol.ts';
import '../rooms/roomCatalogue.ts';
import { standingsOrder } from './Podium.tsx';

/**
 * The full Battle Room standings (Story 5.5): every participant as a row with placement, unchanged name, score and correct
 * count. A forfeiter carries a muted "left" tag; her own row is tagged "You" in an outline tag (no volt). The server's
 * placements are shown as they are.
 */
export function RoomStandings({ participants, selfId }: { participants: ResultParticipant[]; selfId: string }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="results-standings-heading" className="flex flex-col gap-2">
      <h2 id="results-standings-heading" className="text-label font-bold text-muted">
        {t('room.results.standings')}
      </h2>
      <ol data-testid="results-standings" className="flex flex-col gap-1">
        {standingsOrder(participants).map((p) => {
          const self = p.participantId === selfId;
          return (
            <li
              key={p.participantId}
              data-testid="results-standings-row"
              data-self={self ? '' : undefined}
              aria-label={t('room.results.row', {
                rank: p.placement,
                name: self ? t('match.you') : p.displayName,
                score: p.score,
                correct: p.correctCount,
                status: p.forfeited ? `, ${t('match.leftStatus')}` : '',
              })}
              className={`flex min-h-[47px] items-center gap-3 rounded-md bg-card px-3 py-2 ${
                self ? 'border-[1.5px] border-ink' : 'border border-hairline'
              } ${p.forfeited ? 'text-muted' : 'text-ink'}`}
            >
              <span aria-hidden="true" className="w-8 text-label tabular-nums">
                {formatNumber(p.placement)}
              </span>
              <span aria-hidden="true" className="flex min-w-[0] flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-body">
                <span className="break-words">
                  <Lang>{p.displayName}</Lang>
                </span>
                {self ? (
                  <span data-testid="self-tag" className="rounded-sm border border-ink px-2 text-caption font-bold text-ink">
                    {t('match.you')}
                  </span>
                ) : null}
                {p.forfeited ? (
                  <span data-testid="left-tag" className="text-caption text-muted">
                    {t('match.leftStatus')}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="text-caption tabular-nums text-muted">
                {t('room.results.correct', { n: p.correctCount })}
              </span>
              <span aria-hidden="true" className="font-score text-score tabular-nums">
                {formatNumber(p.score)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
