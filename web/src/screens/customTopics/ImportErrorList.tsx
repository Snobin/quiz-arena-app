import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../design/Button.tsx';
import type { Problem } from './importParse.ts';
import { problemLabel, problemsCsv, problemWords } from './problemText.ts';

export const MAX_ROWS = 20;

type Props = { id: string; problems: Problem[]; onJump: (problem: Problem) => void };

/** The problems grouped by field in first-seen order, so the first 20 of many read together. */
function grouped(problems: Problem[]): Problem[] {
  const groups = new Map<string, Problem[]>();
  for (const p of problems) groups.set(p.field, [...(groups.get(p.field) ?? []), p]);
  return [...groups.values()].flat();
}

function download(text: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'minnal-import-problems.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The import error list (Story 3.3 pattern): a `role="alert"` card with the count as a goal, one row per problem with the fix
 * and a monospace field tag. Each row jumps to its line. More than 20 problems shows the first 20 grouped by field, with every
 * problem in a CSV. The card takes focus only when the parent asks (Import tapped, or core answered).
 */
export const ImportErrorList = forwardRef<HTMLDivElement, Props>(function ImportErrorList({ id, problems, onJump }, ref) {
  const { t } = useTranslation();
  const many = problems.length > MAX_ROWS;
  const rows = many ? grouped(problems).slice(0, MAX_ROWS) : problems;
  return (
    <div ref={ref} id={id} role="alert" tabIndex={-1} className="flex flex-col gap-2 rounded-lg border border-brick bg-card p-4">
      <h2 className="text-body font-bold text-ink">{t('import.errors.heading', { count: problems.length })}</h2>
      <p className="text-caption text-muted">{t('import.errors.hint')}</p>
      {many ? <p className="text-caption text-muted">{t('import.errors.more', { shown: MAX_ROWS, count: problems.length })}</p> : null}
      <ul className="flex flex-col">
        {rows.map((p, index) => {
          const { text, fix } = problemWords(p, t);
          const startsGroup = many && (index === 0 || rows[index - 1]!.field !== p.field);
          return (
            <li key={`${p.item ?? 0}-${p.field}-${p.line ?? 0}-${p.column ?? 0}-${index}`} className="border-t border-hairline first:border-t-0">
              {startsGroup ? <p className="pt-2 font-code text-code text-muted">{p.field}</p> : null}
              <button
                type="button"
                aria-label={problemLabel(p, t)}
                onClick={() => onJump(p)}
                className="hit-target flex min-h-target-min w-full min-w-[0] items-start gap-2 py-2 text-left"
              >
                <span aria-hidden="true" className="text-brick">
                  ⚠
                </span>
                <span className="flex min-w-[0] flex-1 flex-col gap-1">
                  <span className="text-body text-brick">{text}</span>
                  {fix ? <span className="text-caption text-muted">{fix}</span> : null}
                </span>
                <code className="flex-none rounded-sm border border-hairline px-1 font-code text-code text-muted">{p.field}</code>
              </button>
            </li>
          );
        })}
      </ul>
      {many ? (
        <Button variant="secondary" className="self-start" onClick={() => download(problemsCsv(problems, t))}>
          {t('import.errors.download')}
        </Button>
      ) : null}
    </div>
  );
});
