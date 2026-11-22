import type { TFunction } from 'i18next';
import type { ImportKey } from './importCatalogue.ts';
import type { Problem, ProblemCode } from './importParse.ts';

const FIX: Partial<Record<ProblemCode, ImportKey>> = {
  'json.extra': 'import.fix.extra',
  'json.comma': 'import.fix.comma',
  'json.end': 'import.fix.end',
  'json.duplicate': 'import.fix.duplicate',
  'json.generic': 'import.fix.generic',
  'questions.missing': 'import.fix.questions',
  'questions.empty': 'import.fix.questions',
  'topic.notText': 'import.fix.topic',
  'item.notObject': 'import.fix.item',
  'question.type': 'import.fix.text',
  'option.type': 'import.fix.text',
  'explanation.type': 'import.fix.text',
  'question.required': 'import.fix.text',
  'options.type': 'import.fix.options',
  'options.count': 'import.fix.options',
  'options.blank': 'import.fix.options',
  'options.duplicate': 'import.fix.options',
  'question.tooLong': 'import.fix.shorten',
  'option.tooLong': 'import.fix.shorten',
  'explanation.tooLong': 'import.fix.shorten',
  'answer.type': 'import.fix.answer',
  'answer.required': 'import.fix.answer',
  'answer.range': 'import.fix.answer',
  'explanation.required': 'import.fix.explanation',
};

/** The words for a problem in the UI language: local problems from the catalogue, server problems as core worded them. */
export function problemWords(p: Problem, t: TFunction): { text: string; fix: string | undefined } {
  if (p.code) {
    const params = { ...p.params, item: p.item };
    const fixKey = FIX[p.code];
    return { text: t(`import.err.${p.code}` as const, params), fix: fixKey ? t(fixKey, params) : undefined };
  }
  const prefix = p.item !== undefined ? `${t('import.row.prefix', { item: p.item })}: ` : '';
  return { text: `${prefix}${p.problem ?? ''}`, fix: p.fix };
}

/** The accessible name of an error row: "Question 7, options, line 41". */
export function problemLabel(p: Problem, t: TFunction): string {
  const field = p.field;
  if (p.line !== undefined && p.item !== undefined) return t('import.row.a11y.item', { item: p.item, field, line: p.line });
  if (p.line !== undefined) return t('import.row.a11y.line', { field, line: p.line });
  return t('import.row.a11y.bare', { field });
}

/** The rows of the "all problems" CSV: one line per problem, every field quoted. */
export function problemsCsv(problems: Problem[], t: TFunction): string {
  const cell = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = problems.map((p) => {
    const { text, fix } = problemWords(p, t);
    return [p.item, p.field, text, fix, p.line, p.column].map(cell).join(',');
  });
  return [['item', 'field', 'problem', 'fix', 'line', 'column'].map(cell).join(','), ...rows].join('\r\n');
}
