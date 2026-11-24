import type { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { announce } from '../shell/announce.ts';
import { adminT, type AdminKey } from './adminI18n.ts';
import { AdminApiError, createSubject, createTopic, type AdminSubject, type FieldProblem } from './api.ts';
import type { OPTION_FIELDS, Values } from './questionForm.ts';

/**
 * The question editor's form controls (Story 3.2): labelled fields wired to their problem text, the answer radios, and the
 * subject and topic selects with an inline "New…" name field. Split out of `QuestionEditor.tsx`; they hold no editor state
 * beyond their own inline-create state.
 */

export const CONTROL = 'min-h-target-min w-full rounded-md border-[1.5px] border-control-edge bg-card px-3 py-2 text-body text-ink aria-[invalid=true]:border-brick';
export const BUTTON = 'hit-target inline-flex min-h-target-min items-center rounded-md border-[1.5px] border-ink bg-card px-4 text-body';
export const PRIMARY = 'hit-target inline-flex min-h-target-min items-center rounded-md bg-band px-4 text-body text-on-band';
const NEW = '__new__';

export const problemText = (p: FieldProblem): string => (p.fix ? `${p.problem}. ${p.fix}` : p.problem);

export function FieldProblems({ id, problems }: { id: string; problems: FieldProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <p id={id} className="text-caption font-semibold text-brick">
      <span aria-hidden="true">⚠ </span>
      {problems.map(problemText).join(' ')}
    </p>
  );
}

/** The wiring every control shares: id, aria-invalid, and aria-describedby pointing at its problem text. */
function wire(name: string, problems: FieldProblem[], extra?: string) {
  const describedBy = [problems.length ? `q-${name}-error` : null, extra].filter(Boolean).join(' ');
  return { id: `q-${name}`, 'aria-invalid': problems.length ? (true as const) : undefined, 'aria-describedby': describedBy || undefined };
}

function Labelled({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`q-${name}`} className="text-label font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

export function SelectField({
  name,
  values,
  problems,
  onChange,
  children,
}: {
  name: 'category' | 'examLevel' | 'difficulty';
  values: Values;
  problems: FieldProblem[];
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Labelled name={name} label={adminT(`field.${name}` as AdminKey)}>
      <select {...wire(name, problems)} value={values[name]} onChange={(event) => onChange(event.target.value)} className={CONTROL}>
        <option value="">{adminT('field.choose')}</option>
        {children}
      </select>
      <FieldProblems id={`q-${name}-error`} problems={problems} />
    </Labelled>
  );
}

export function TextField({
  name,
  lang,
  rows,
  value,
  problems,
  onChange,
}: {
  name: 'textMl' | 'textEn' | 'explanation';
  lang?: string;
  rows: number;
  value: string;
  problems: FieldProblem[];
  onChange: (value: string) => void;
}) {
  const font = lang === 'en' ? '' : 'font-option text-option';
  return (
    <Labelled name={name} label={adminT(`field.${name}` as AdminKey)}>
      <textarea
        {...wire(name, problems)}
        lang={lang ?? 'ml'}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL} ${font}`}
      />
      <FieldProblems id={`q-${name}-error`} problems={problems} />
    </Labelled>
  );
}

export function InputField({
  name,
  value,
  problems,
  onChange,
  placeholder,
  readOnly,
  hint,
  invalidGroup,
}: {
  name: (typeof OPTION_FIELDS)[number] | 'attribution' | 'sourceRef';
  value: string;
  problems: FieldProblem[];
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  hint?: string;
  invalidGroup?: boolean;
}) {
  const hintId = `q-${name}-hint`;
  const wired = wire(name, problems, hint ? hintId : undefined);
  return (
    <Labelled name={name} label={adminT(`field.${name}` as AdminKey)}>
      <input
        {...wired}
        aria-invalid={wired['aria-invalid'] ?? (invalidGroup ? true : undefined)}
        type="text"
        lang="ml"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL}
      />
      {hint ? (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
      <FieldProblems id={`q-${name}-error`} problems={problems} />
    </Labelled>
  );
}

export function AnswerField({ value, problems, onChange }: { value: string; problems: FieldProblem[]; onChange: (value: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-label font-bold">{adminT('field.answerIndex')}</legend>
      <div role="radiogroup" aria-label={adminT('field.answerIndex')} aria-describedby={problems.length ? 'q-answerIndex-error' : undefined} aria-invalid={problems.length ? true : undefined} className="flex gap-4">
        {['A', 'B', 'C', 'D'].map((letter, i) => (
          <label key={letter} className="hit-target inline-flex min-h-target-min items-center gap-2 text-body">
            <input type="radio" id={`q-answer-${i}`} name="answerIndex" value={String(i)} checked={value === String(i)} onChange={() => onChange(String(i))} />
            {letter}
          </label>
        ))}
      </div>
      <FieldProblems id="q-answerIndex-error" problems={problems} />
    </fieldset>
  );
}

type SubjectTopicProps = {
  values: Values;
  subjects: AdminSubject[];
  problems: { subjectId: FieldProblem[]; topicId: FieldProblem[] };
  onSubject: (id: string) => void;
  onTopic: (id: string) => void;
  onSubjectProblemsClear: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
};

/** Subject and topic selects, each with a "New…" option that opens an inline labelled name field. */
export function SubjectTopic({ values, subjects, problems, onSubject, onTopic, onSubjectProblemsClear, queryClient }: SubjectTopicProps) {
  const [creating, setCreating] = useState<'subject' | 'topic' | null>(null);
  const topics = subjects.find((s) => s.id === values.subjectId)?.topics ?? [];

  const created = (kind: 'subject' | 'topic', id: string, name: string, existed: boolean) => {
    if (kind === 'subject') {
      if (!existed) {
        queryClient.setQueryData<AdminSubject[]>(['admin', 'subjects'], (current) => [...(current ?? []), { id, name, topics: [] }]);
      }
      onSubject(id);
      onSubjectProblemsClear();
    } else {
      if (!existed) {
        queryClient.setQueryData<AdminSubject[]>(['admin', 'subjects'], (current) =>
          (current ?? []).map((s) => (s.id === values.subjectId ? { ...s, topics: [...s.topics, { id, name }] } : s)),
        );
      }
      onTopic(id);
    }
    void queryClient.invalidateQueries({ queryKey: ['admin', 'subjects'] });
    setCreating(null);
    announce(existed ? adminT('newname.exists') : adminT('newname.created', { name }));
  };

  const add = async (kind: 'subject' | 'topic', name: string): Promise<FieldProblem[] | string | null> => {
    try {
      const id = kind === 'subject' ? await createSubject(name) : await createTopic(values.subjectId, name);
      created(kind, id, name.trim(), false);
      return null;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 409 && error.existingId) {
        created(kind, error.existingId, name.trim(), true);
        return null;
      }
      if (error instanceof AdminApiError && error.status === 400 && error.errors.length > 0) return error.errors;
      return adminT('newname.failed', { detail: error instanceof AdminApiError && error.detail ? error.detail : '' }).trim();
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="q-subjectId" className="text-label font-bold">
          {adminT('field.subjectId')}
        </label>
        <select
          {...wire('subjectId', problems.subjectId)}
          value={values.subjectId}
          onChange={(event) => (event.target.value === NEW ? setCreating('subject') : onSubject(event.target.value))}
          className={CONTROL}
        >
          <option value="">{adminT('field.choose')}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW}>{adminT('newname.subject')}</option>
        </select>
        <FieldProblems id="q-subjectId-error" problems={problems.subjectId} />
        {creating === 'subject' ? <NewName kind="subject" onAdd={(name) => add('subject', name)} onCancel={() => setCreating(null)} /> : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="q-topicId" className="text-label font-bold">
          {adminT('field.topicId')}
        </label>
        <select
          {...wire('topicId', problems.topicId)}
          value={values.topicId}
          onChange={(event) => (event.target.value === NEW ? (values.subjectId ? setCreating('topic') : undefined) : onTopic(event.target.value))}
          className={CONTROL}
        >
          <option value="">{adminT('field.choose')}</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          {values.subjectId ? <option value={NEW}>{adminT('newname.topic')}</option> : null}
        </select>
        <FieldProblems id="q-topicId-error" problems={problems.topicId} />
        {creating === 'topic' ? <NewName kind="topic" onAdd={(name) => add('topic', name)} onCancel={() => setCreating(null)} /> : null}
      </div>
    </>
  );
}

function NewName({ kind, onAdd, onCancel }: { kind: 'subject' | 'topic'; onAdd: (name: string) => Promise<FieldProblem[] | string | null>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;

  useEffect(() => input.current?.focus(), []);

  const add = async () => {
    if (busy) return;
    if (!name.trim()) {
      setError('required');
      input.current?.focus();
      return;
    }
    setBusy(true);
    const result = await onAdd(name);
    setBusy(false);
    if (result !== null) {
      setError(typeof result === 'string' ? result : result.map(problemText).join(' '));
      input.current?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-hairline p-2">
      <label htmlFor={id} className="text-label font-bold">
        {adminT(kind === 'subject' ? 'newname.subjectLabel' : 'newname.topicLabel')}
      </label>
      <input
        ref={input}
        id={id}
        type="text"
        value={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setName(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void add();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        className={CONTROL}
      />
      {error ? (
        <p id={errorId} className="text-caption font-semibold text-brick">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" aria-disabled={busy} onClick={() => void add()} className={PRIMARY}>
          {adminT('newname.add')}
        </button>
        <button type="button" onClick={onCancel} className={BUTTON}>
          {adminT('newname.cancel')}
        </button>
      </div>
    </div>
  );
}
