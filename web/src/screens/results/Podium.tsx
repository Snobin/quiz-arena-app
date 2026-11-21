import { useTranslation } from 'react-i18next';
import { VoltText } from '../../design/peak/volt.tsx';
import { formatNumber } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import type { ResultParticipant } from '../../realtime/protocol.ts';
import '../rooms/roomCatalogue.ts';

/** The standings in display order: placement, then name (equal placements are ordered by name for display only). */
export function standingsOrder(participants: ResultParticipant[]): ResultParticipant[] {
  return [...participants].sort((a, b) => a.placement - b.placement ||
      a.displayName.localeCompare(b.displayName, 'en') ||
      a.participantId.localeCompare(b.participantId, 'en'));
}

/** Column heights by placement: #1 tallest; a tied entry shares its placement's height. */
const HEIGHT: Record<number, string> = { 1: 'min-h-[9rem]', 2: 'min-h-[7rem]' };
const heightOf = (placement: number) => HEIGHT[placement] ?? 'min-h-[5.5rem]';

/**
 * The Battle Room podium (Story 5.5): the first three entries of the standings as cards ordered 2-1-3 (only 2 and 1 with
 * two players), #1 tallest; tied entries show the same numeral and height. Her own column takes the band fill, and her
 * score is volt only at placement 1. Names are inserted unchanged and wrap, never truncate. No reaction controls.
 */
export function Podium({ participants, selfId }: { participants: ResultParticipant[]; selfId: string }) {
  const { t } = useTranslation();
  const top = standingsOrder(participants).slice(0, 3);
  const columns = top.length >= 3 ? [top[1]!, top[0]!, top[2]!] : top.length === 2 ? [top[1]!, top[0]!] : top;
  return (
    <section aria-labelledby="podium-heading" className="flex flex-col gap-2">
      <h2 id="podium-heading" className="sr-only">
        {t('room.podium.heading')}
      </h2>
      <ol data-testid="podium" className="flex items-end gap-2">
        {columns.map((entry) => {
          const self = entry.participantId === selfId;
          const name = self ? t('match.you') : entry.displayName;
          const score = formatNumber(entry.score);
          return (
            <li
              key={entry.participantId}
              data-testid="podium-column"
              data-placement={entry.placement}
              data-self={self ? '' : undefined}
              aria-label={t('room.final.row', { rank: entry.placement, name, score: entry.score })}
              className={`flex min-w-[0] flex-1 flex-col items-center justify-start gap-1 rounded-md px-2 py-3 text-center ${heightOf(entry.placement)} ${
                self ? 'surface-band border border-band' : 'border border-hairline bg-card text-ink'
              }`}
            >
              <span aria-hidden="true" className="font-score text-score tabular-nums">
                {formatNumber(entry.placement)}
              </span>
              <span aria-hidden="true" className="w-full break-words text-body font-bold">
                {self ? name : <Lang>{name}</Lang>}
              </span>
              {self && entry.placement === 1 ? (
                <VoltText testId="podium-self-score" className="text-body tabular-nums">
                  <span aria-hidden="true">{score}</span>
                </VoltText>
              ) : (
                <span aria-hidden="true" className="text-body tabular-nums">
                  {score}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
