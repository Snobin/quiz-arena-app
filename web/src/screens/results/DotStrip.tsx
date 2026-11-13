import { useTranslation } from 'react-i18next';
import type { BreakdownAnswer } from '../../realtime/protocol.ts';

/**
 * One 7px dot per asked question, in order (DESIGN.md › Dot strip): ink fill = correct, brick
 * ring = wrong, a grey ring = not answered. Read-only; exposed as a list ("Q1 correct … Q10
 * wrong") with the glyphs `aria-hidden`. Correctness is the server's.
 */
export function DotStrip({ answers }: { answers: BreakdownAnswer[] }) {
  const { t } = useTranslation();
  return (
    <ol aria-label={t('results.dots')} data-testid="dot-strip" className="flex flex-wrap items-center gap-2">
      {answers.map((answer, i) => {
        const state = answer.correct ? 'correct' : answer.pickedIndex === null ? 'missed' : 'wrong';
        const look =
          state === 'correct'
            ? 'bg-ink border border-ink'
            : state === 'wrong'
              ? 'border-[1.5px] border-brick'
              : 'border-[1.5px] border-unanswered';
        return (
          <li key={i} data-state={state} className="inline-flex items-center">
            <span aria-hidden="true" className={`inline-block size-[7px] rounded-full ${look}`} />
            <span className="sr-only">{t(`results.dot.${state}`, { n: i + 1 })}</span>
          </li>
        );
      })}
    </ol>
  );
}
