import { useTranslation } from 'react-i18next';
import { BotBadge } from '../../design/BotBadge.tsx';
import { PeakBandSurface, VoltText } from '../../design/peak/volt.tsx';
import { formatNumber } from '../../i18n/format.ts';
import { Lang } from '../../i18n/Lang.tsx';
import type { DeltaState } from '../../ratings/useMatchDelta.ts';
import type { ResultView } from './outcome.ts';
import { RatingDelta } from './RatingDelta.tsx';

/**
 * The compact results band (DESIGN.md › Results band / Draw band). Win: "You won!", her score in
 * volt, the opponent muted, a volt edge in dark mode. Loss: the ink band with no volt and the loss
 * line naming the winner unchanged. Draw: "Draw", both scores in white, no volt. A registered player's own
 * rated match adds the rating-change slot (Story 2.6). A forfeited opponent carries the "left" tag; a bot always carries the BOT badge.
 */
export function ResultsBand({ view, delta }: { view: ResultView; delta?: DeltaState }) {
  const { t } = useTranslation();
  const { kind, self, rival, winner } = view;
  const line =
    kind === 'win'
      ? t('result.winTitle')
      : kind === 'draw'
        ? t('result.draw')
        : t('result.lossBand', { name: winner?.displayName ?? rival?.displayName ?? '' });
  const selfScore = formatNumber(self.score);
  // A draw shows both scores in white; otherwise the opponent is muted.
  const bothWhite = kind === 'draw';
  const rivalTone = bothWhite ? 'text-on-band' : 'text-on-band-muted';
  return (
    <PeakBandSurface volt={kind === 'win'} testId="results-band" result={kind}>
      <p data-testid="results-line" className="font-peak-word text-peak-word text-on-band">
        {line}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {kind === 'win' ? (
          <VoltText testId="results-self-score" className="font-peak-points text-peak-points tabular-nums">
            {selfScore}
          </VoltText>
        ) : (
          <span data-testid="results-self-score" className="font-peak-points text-peak-points tabular-nums text-on-band">
            {selfScore}
          </span>
        )}
        {rival ? (
          <span
            data-testid="results-rival"
            className={`inline-flex flex-wrap items-center gap-2 text-body tabular-nums ${rivalTone}`}
          >
            <Lang>{rival.displayName}</Lang>
            {rival.kind === 'BOT' ? (
              <span className="rounded-sm bg-card">
                <BotBadge />
              </span>
            ) : null}
            {rival.forfeited ? <span data-testid="rival-left">{t('match.leftStatus')}</span> : null}
            <span data-testid="results-rival-score">{formatNumber(rival.score)}</span>
          </span>
        ) : null}
      </div>
      {delta ? <RatingDelta state={delta} kind={kind} /> : null}
    </PeakBandSurface>
  );
}
