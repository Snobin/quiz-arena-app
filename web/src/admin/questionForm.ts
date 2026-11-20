import type { FieldProblem, QuestionDetail, QuestionPayload } from './api.ts';

/** The editor's field values: all strings, so a half-typed form is representable. `answerIndex` is '0'..'3' or ''. */
export type Values = {
  category: string;
  subjectId: string;
  topicId: string;
  examLevel: string;
  difficulty: string;
  textMl: string;
  textEn: string;
  options: [string, string, string, string];
  answerIndex: string;
  explanation: string;
  attribution: string;
  sourceRef: string;
};

export const EMPTY_VALUES: Values = {
  category: 'KERALA_PSC',
  subjectId: '',
  topicId: '',
  examLevel: '',
  difficulty: '',
  textMl: '',
  textEn: '',
  options: ['', '', '', ''],
  answerIndex: '',
  explanation: '',
  attribution: '',
  sourceRef: '',
};

/** The caps the server's QuestionValidator enforces, in characters after NFC and trimming. */
export const CAPS = { text: 1000, option: 300, explanation: 2000, attribution: 120 } as const;

export const CATEGORIES = ['KERALA_PSC', 'SCHOOL_QUIZ', 'GENERAL_KERALA'] as const;
export const LEVELS = ['TENTH', 'DEGREE', 'OTHER'] as const;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export const OPTION_FIELDS = ['optionA', 'optionB', 'optionC', 'optionD'] as const;

/** NFC-normalised and trimmed, as the server does before it counts or compares. */
export const norm = (value: string): string => value.normalize('NFC').trim();

/** Characters (code points), as the server counts them. */
export const length = (value: string): number => Array.from(norm(value)).length;

export function fromDetail(detail: QuestionDetail): Values {
  const c = detail.editing.content;
  return {
    category: c.category,
    subjectId: c.subjectId,
    topicId: c.topicId,
    examLevel: c.examLevel,
    difficulty: c.difficulty,
    textMl: c.textMl ?? '',
    textEn: c.textEn ?? '',
    options: [c.options[0] ?? '', c.options[1] ?? '', c.options[2] ?? '', c.options[3] ?? ''],
    answerIndex: String(c.answerIndex),
    explanation: c.explanation,
    attribution: c.attribution ?? '',
    sourceRef: detail.sourceRef ?? '',
  };
}

export function toPayload(values: Values, rowVersion?: number): QuestionPayload {
  return {
    category: values.category,
    subjectId: values.subjectId,
    topicId: values.topicId,
    examLevel: values.examLevel,
    difficulty: values.difficulty,
    textMl: values.textMl,
    textEn: values.textEn,
    options: [...values.options],
    answerIndex: values.answerIndex === '' ? null : Number(values.answerIndex),
    explanation: values.explanation,
    attribution: values.attribution,
    sourceRef: values.sourceRef,
    ...(rowVersion === undefined ? {} : { rowVersion }),
  };
}

const tooLong = (field: string, value: string, max: number): FieldProblem | null => {
  const n = length(value);
  return n > max ? { field, problem: `must be at most ${max} characters (got ${n})`, fix: `Shorten it by ${n - max} characters.` } : null;
};

/**
 * The client mirror of the server's QuestionValidator (and of the admin endpoint's id checks): the same field names,
 * rules and wording. The server stays authoritative and returns the same problems for a payload that skips this.
 */
export function validate(values: Values): FieldProblem[] {
  const problems: FieldProblem[] = [];
  const add = (problem: FieldProblem | null) => {
    if (problem) problems.push(problem);
  };
  if (!values.category) problems.push({ field: 'category', problem: 'required' });
  if (!values.subjectId) problems.push({ field: 'subjectId', problem: 'required' });
  if (!values.topicId) problems.push({ field: 'topicId', problem: 'required' });
  if (!values.examLevel) problems.push({ field: 'examLevel', problem: 'required' });
  if (!values.difficulty) problems.push({ field: 'difficulty', problem: 'required' });
  if (!norm(values.textMl) && !norm(values.textEn)) {
    problems.push({ field: 'textMl/textEn', problem: 'required: at least one of textMl or textEn' });
  }
  const seen = new Set<string>();
  let nonBlank = 0;
  values.options.forEach((option, i) => {
    const text = norm(option);
    if (!text) {
      problems.push({ field: OPTION_FIELDS[i] ?? 'options', problem: 'required: every option must be non-blank' });
    } else {
      nonBlank += 1;
      seen.add(text.toLowerCase());
    }
  });
  if (seen.size < nonBlank) problems.push({ field: 'options', problem: 'must be 4 different answers' });
  if (values.answerIndex === '') problems.push({ field: 'answerIndex', problem: 'required: a whole number 0–3' });
  if (!norm(values.explanation)) problems.push({ field: 'explanation', problem: 'required' });
  add(tooLong('textMl', values.textMl, CAPS.text));
  add(tooLong('textEn', values.textEn, CAPS.text));
  values.options.forEach((option, i) => add(tooLong(OPTION_FIELDS[i] ?? 'options', option, CAPS.option)));
  add(tooLong('explanation', values.explanation, CAPS.explanation));
  add(tooLong('attribution', values.attribution, CAPS.attribution));
  return problems;
}

/** The id of the control a problem on `field` belongs to (the first of a group). */
export function controlId(field: string): string {
  if (field === 'textMl/textEn') return 'q-textMl';
  if (field === 'options') return 'q-optionA';
  if (field === 'answerIndex') return 'q-answer-0';
  return `q-${field}`;
}

/** The control a problem is shown under: 'textMl/textEn' sits under Malayalam text, 'options' under the options group. */
export function shownUnder(field: string): string {
  if (field === 'textMl/textEn') return 'textMl';
  if (field === 'options') return 'optionA';
  return field;
}
