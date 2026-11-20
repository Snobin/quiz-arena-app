import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber, formatSigned, formatTenths } from '../../i18n/format.ts';
import { uiLanguage } from '../../i18n/index.ts';
import { detectLanguage } from '../../i18n/Lang.tsx';
import type { BreakdownAnswer, QuestionSource, ResultQuestion } from '../../realtime/protocol.ts';
import { ReportQuestion } from '../../report/ReportQuestion.tsx';
import { baseLanguage } from '../match/QuestionCard.tsx';
import { RevealDetails } from '../match/RevealDetails.tsx';

/**
 * `report`: what the report link needs (Story 3.5). `marked`: she tapped "Something wrong?" on this question
 * during the live reveal, so its row opens expanded with the note field ready.
 */
export type RowReport = { matchId: string; questionSource: QuestionSource; marked: boolean };

type BreakdownRowProps = { index: number; question: ResultQuestion; answer: BreakdownAnswer; report?: RowReport };

const HEADER = 'flex w-full min-h-target-min items-center gap-3 px-4 py-2 text-left text-body';

/**
 * One asked question in the breakdown (DESIGN.md › Breakdown row). A correct row renders
 * collapsed on load as a `<button aria-expanded="false">` reading "Q3 ✓ 9 s +800"; expanding it
 * shows the full question. Wrong and missed rows are always expanded: the question, "You:" (her
 * pick in brick, or "not answered"), "Answer:" (bold), the explanation and the attribution or
 * "source not available". Expanding never animates height (so the reduced path needs nothing
 * extra). The report link sits under the attribution (Story 3.5). Every value is the server's.
 */
export function BreakdownRow({ index, question, answer, report }: BreakdownRowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(report?.marked === true);
  const detailsId = useId();
  const n = index + 1;
  const state = answer.correct ? 'correct' : answer.pickedIndex === null ? 'missed' : 'wrong';
  const header = (
    <>
      <span aria-hidden="true" className="font-bold text-ink">
        {t('results.questionShort', { n })} {answer.correct ? '✓' : '✗'}
      </span>
      <span className="sr-only">{t(`results.dot.${state}`, { n })}</span>
      {answer.responseMs !== null ? (
        <span data-testid="row-time" className="tabular-nums text-muted">
          {t('results.seconds', { seconds: formatTenths(answer.responseMs / 1000) })}
        </span>
      ) : null}
      <span
        data-testid="row-points"
        className={`ml-auto font-score text-score tabular-nums ${answer.points === 0 ? 'text-brick' : 'text-ink'}`}
      >
        {answer.points === 0 ? formatNumber(0) : formatSigned(answer.points)}
      </span>
    </>
  );

  if (answer.correct) {
    return (
      <li data-testid="breakdown-row" data-state={state} className="rounded-md border border-hairline bg-card">
        <button type="button" aria-expanded={open} aria-controls={detailsId} className={HEADER} onClick={() => setOpen((v) => !v)}>
          {header}
        </button>
        <div id={detailsId} hidden={!open}>
          {open ? <Details question={question} answer={answer} report={report} /> : null}
        </div>
      </li>
    );
  }
  return (
    <li data-testid="breakdown-row" data-state={state} className="rounded-md border border-hairline bg-card">
      <div className={HEADER}>{header}</div>
      <Details question={question} answer={answer} report={report} />
    </li>
  );
}

function Details({ question, answer, report }: { question: ResultQuestion; answer: BreakdownAnswer; report?: RowReport }) {
  const { t, i18n } = useTranslation();
  const language = baseLanguage(question, uiLanguage(i18n));
  const text = language === 'ml' ? question.textMl : question.textEn;
  const correctText = question.options[question.answerIndex] ?? '';
  const picked = answer.pickedIndex !== null ? (question.options[answer.pickedIndex] ?? '') : null;
  return (
    <div data-testid="row-details" className="px-4 pb-4">
      <p lang={language} className="font-option text-option text-ink">
        {text}
      </p>
      <p data-testid="row-yours" className="mt-2 text-body">
        <span className="text-muted">{t('results.yours')}</span>{' '}
        {picked === null ? (
          <span className="text-muted">{t('results.notAnswered')}</span>
        ) : (
          <span lang={detectLanguage(picked)} className={answer.correct ? 'text-ink' : 'text-brick'}>
            {picked}
          </span>
        )}
      </p>
      {answer.correct ? null : (
        <p data-testid="row-answer" className="mt-1 text-body">
          <span className="text-muted">{t('results.answer')}</span>{' '}
          <span lang={detectLanguage(correctText)} className="font-bold text-ink">
            {correctText}
          </span>
        </p>
      )}
      <RevealDetails explanation={question.explanation} attribution={question.attribution} />
      {report ? (
        <ReportQuestion
          questionId={question.questionId}
          version={question.version}
          surface={report.marked ? 'LIVE_REVEAL' : 'RESULTS'}
          matchId={report.matchId}
          questionSource={report.questionSource}
          startOpen={report.marked}
        />
      ) : null}
    </div>
  );
}
