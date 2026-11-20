import { useEffect, useRef, useState } from 'react';
import { announce } from '../shell/announce.ts';
import { Link } from '../shell/Link.tsx';
import { adminT } from './adminI18n.ts';
import type { UploadResult as Result } from './api.ts';
import { rowsToFix } from './csv.ts';

const BUTTON = 'hit-target inline-flex min-h-target-min items-center rounded-md border-[1.5px] border-ink bg-card px-4 text-body';
const MAX_SHOWN = 20;

type Problem = Result['errors'][number];

function ProblemLine({ problem }: { problem: Problem }) {
  const text = problem.fix
    ? adminT('upload.problemFix', { row: problem.row, field: '\u0000', problem: problem.problem, fix: problem.fix })
    : adminT('upload.problemRow', { row: problem.row, field: '\u0000', problem: problem.problem });
  const [before, after] = text.split('\u0000');
  return (
    <li className="text-brick">
      <span aria-hidden="true">⚠ </span>
      {before}
      <code className="font-code text-code">{problem.field}</code>
      {after}
    </li>
  );
}

/** Tab-separated `row · field · problem` lines for every problem. */
export function errorLines(errors: Problem[]): string {
  return errors.map((e) => `${e.row}\t${e.field}\t${e.problem}`).join('\n');
}

/** The result of an upload: summary, created subjects and topics, the review link, the error list and the export actions. */
export function UploadResult({ result, fileText }: { result: Result; fileText: string }) {
  const alert = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null);
  const problems = result.errors;
  const summary =
    result.importedCount === 0 && result.errorCount > 0
      ? adminT('upload.allFailed')
      : adminT('upload.summary', { imported: result.importedCount.toLocaleString('en-US'), count: result.errorCount });

  useEffect(() => {
    if (problems.length > 0) alert.current?.focus();
    announce(summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announce once per result
  }, [result]);

  const shown = problems.length > MAX_SHOWN ? problems.slice(0, MAX_SHOWN) : problems;
  const grouped = problems.length > MAX_SHOWN;
  const groups = grouped ? [...new Set(shown.map((p) => p.field))].map((field) => ({ field, items: shown.filter((p) => p.field === field) })) : [];

  const download = () => {
    const blob = new Blob([rowsToFix(fileText, problems)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minnal-rows-to-fix.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(errorLines(problems));
      setCopied('copied');
      announce(adminT('upload.copied'));
    } catch {
      setCopied('failed');
      announce(adminT('upload.copyFailed'));
    }
  };

  return (
    <section aria-label={adminT('upload.result')} className="flex flex-col gap-3">
      <p className="text-body font-bold">{summary}</p>
      {result.createdSubjects.length > 0 ? (
        <p>{adminT('upload.createdSubjects', { count: result.createdSubjects.length, names: result.createdSubjects.join(', ') })}</p>
      ) : null}
      {result.createdTopics.length > 0 ? (
        <p>{adminT('upload.createdTopics', { count: result.createdTopics.length, names: result.createdTopics.join(', ') })}</p>
      ) : null}
      {result.importedCount > 0 ? (
        <p>
          <Link to="/admin?status=DRAFT" className="hit-target inline-flex min-h-target-min items-center underline">
            {adminT('upload.review', { count: result.importedCount })}
          </Link>
        </p>
      ) : null}

      {problems.length > 0 ? (
        <>
          <div ref={alert} role="alert" tabIndex={-1} className="rounded-lg border-[1.5px] border-brick bg-card p-4">
            <h2 className="text-body font-bold">
              <span aria-hidden="true">⚠ </span>
              {adminT('upload.problems', { count: problems.length })}
            </h2>
            {grouped ? <p className="mt-1 text-muted">{adminT('upload.firstGrouped', { shown: MAX_SHOWN, total: problems.length })}</p> : null}
            {grouped ? (
              groups.map((g) => (
                <div key={g.field} className="mt-3">
                  <h3 className="font-bold">
                    <code className="font-code text-code">{g.field}</code>
                  </h3>
                  <ul className="mt-1 flex flex-col gap-1">
                    {g.items.map((p, i) => (
                      <ProblemLine key={`${p.row}-${i}`} problem={p} />
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {shown.map((p, i) => (
                  <ProblemLine key={`${p.row}-${p.field}-${i}`} problem={p} />
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={download} className={BUTTON}>
              {adminT('upload.download')}
            </button>
            <button type="button" onClick={() => void copy()} className={BUTTON}>
              {adminT('upload.copy')}
            </button>
            {copied ? <span className="text-muted">{adminT(copied === 'copied' ? 'upload.copied' : 'upload.copyFailed')}</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
