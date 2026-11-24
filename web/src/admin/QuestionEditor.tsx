import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { announce } from '../shell/announce.ts';
import { Link } from '../shell/Link.tsx';
import { navigate } from '../shell/router.ts';
import { adminT, type AdminKey } from './adminI18n.ts';
import {
  AdminApiError,
  createQuestion,
  fetchQuestion,
  fetchSubjects,
  restoreQuestion,
  saveDraft,
  type FieldProblem,
  type QuestionDetail,
} from './api.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { QuestionPreview } from './QuestionPreview.tsx';
import { BUTTON, PRIMARY, AnswerField, FieldProblems, InputField, SelectField, SubjectTopic, TextField, problemText } from './QuestionFields.tsx';
import {
  CATEGORIES,
  DIFFICULTIES,
  EMPTY_VALUES,
  LEVELS,
  OPTION_FIELDS,
  controlId,
  fromDetail,
  shownUnder,
  toPayload,
  validate,
  type Values,
} from './questionForm.ts';
import { useAdminTitle } from './useAdminTitle.ts';
import { queueAction, refKey, undoBatch, useDraftActions } from './draftActions.ts';
import { shortcutFrom } from './shortcuts.ts';
import { UndoLine } from './UndoLine.tsx';
import { ReportBanner } from './ReportBanner.tsx';
import { useLeaveGuard } from '../shell/useLeaveGuard.ts';


/** A "Saved…" line carried across the redirect from /admin/questions/new to the new question's editor. */
let carriedStatus: string | null = null;

const labelOf = (field: string): string => {
  const key = `field.${shownUnder(field)}` as AdminKey;
  return field === 'textMl/textEn' ? `${adminT('field.textMl')} / ${adminT('field.textEn')}` : adminT(key);
};

type Load = { status: 'loading' } | { status: 'error'; notFound: boolean; detail: string | null } | { status: 'ready'; detail: QuestionDetail | null };

/**
 * The question editor: a full page (not a modal) for a new question (`questionId` null) or an existing one. Every save
 * is a draft; nothing reaches players until it is published (Story 3.4). The server's validator is authoritative; the
 * client runs the same rules first.
 */
export function QuestionEditor({ questionId }: { questionId: string | null }) {
  const queryClient = useQueryClient();
  const [load, setLoad] = useState<Load>(questionId ? { status: 'loading' } : { status: 'ready', detail: null });
  const [values, setValues] = useState<Values>(EMPTY_VALUES);
  const [baseline, setBaseline] = useState(() => JSON.stringify(EMPTY_VALUES));
  const [rowVersion, setRowVersion] = useState(0);
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [summaryTick, setSummaryTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(carriedStatus);
  const [general, setGeneral] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const subjectsQuery = useQuery({ queryKey: ['admin', 'subjects'], queryFn: fetchSubjects, retry: false });
  const subjects = subjectsQuery.data ?? [];

  const dirty = JSON.stringify(values) !== baseline;
  const guard = useLeaveGuard(dirty);

  const apply = useCallback((detail: QuestionDetail) => {
    const next = fromDetail(detail);
    setValues(next);
    setBaseline(JSON.stringify(next));
    setRowVersion(detail.editing.rowVersion);
    setLoad({ status: 'ready', detail });
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!questionId) return null;
    return fetchQuestion(questionId);
  }, [questionId]);

  useEffect(() => {
    carriedStatus = null;
    if (!questionId) return;
    let alive = true;
    fetchDetail()
      .then((detail) => {
        if (alive && detail) apply(detail);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const api = error instanceof AdminApiError ? error : null;
        setLoad({ status: 'error', notFound: api?.status === 404, detail: api?.detail ?? null });
      });
    return () => {
      alive = false;
    };
  }, [questionId, fetchDetail, apply]);

  const detail = load.status === 'ready' ? load.detail : null;
  const deleted = detail?.deleted ?? false;
  const editing = detail?.editing ?? null;

  // Publish and Discard for an open draft, with the same 5 s Undo as the Drafts page.
  const draftRef =
    detail && editing && editing.status === 'DRAFT' && !deleted ? { questionId: detail.questionId, version: editing.version, displayNo: detail.displayNo } : null;
  const batches = useDraftActions((s) => s.batches);
  const failures = useDraftActions((s) => s.failures);
  const myBatch = draftRef ? batches.find((b) => b.refs.some((r) => refKey(r) === refKey(draftRef))) : undefined;
  const failure = draftRef ? failures[refKey(draftRef)] : undefined;
  const publishButton = useRef<HTMLButtonElement>(null);
  const hadBatch = useRef(false);
  const dirtyNow = useRef(dirty);
  dirtyNow.current = dirty;
  useEffect(() => {
    if (myBatch) {
      hadBatch.current = true;
      return;
    }
    if (!hadBatch.current) return;
    hadBatch.current = false;
    // The action was committed (or failed): show the question as it now is, unless there are unsaved edits.
    if (!dirtyNow.current) {
      fetchDetail()
        .then((fresh) => {
          if (fresh && !dirtyNow.current) apply(fresh);
        })
        .catch(() => undefined);
    }
  }, [myBatch, fetchDetail, apply]);

  const draftAction = (action: 'publish' | 'discard') => {
    if (!draftRef || myBatch) return;
    if (dirty) {
      announce(adminT('editor.saveFirst'));
      return;
    }
    queueAction(queryClient, action, [draftRef], false);
  };
  const onToolbarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = shortcutFrom(event);
    if (key !== 'p' && key !== 'd') return;
    event.preventDefault();
    draftAction(key === 'p' ? 'publish' : 'discard');
  };

  let header = adminT('editor.header.new');
  if (detail && editing) {
    const no = detail.displayNo.toLocaleString('en-US');
    if (detail.deleted) header = adminT('editor.header.deleted', { no });
    else if (editing.status === 'DRAFT') header = adminT('editor.header.draft', { no, version: editing.version });
    else if (editing.status === 'PUBLISHED') header = adminT('editor.header.published', { no, version: editing.version });
    else header = adminT('editor.header.discarded', { no, version: editing.version });
  }
  useAdminTitle(questionId ? header : adminT('editor.newTitle'));

  // The error summary takes focus whenever a save finds problems.
  useEffect(() => {
    if (summaryTick > 0) summary.current?.focus();
  }, [summaryTick]);

  const set = <K extends keyof Values>(field: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setProblems((current) => current.filter((p) => shownUnder(p.field) !== field && !(field === 'textEn' && p.field === 'textMl/textEn')));
    setSaved(null);
  };
  const setOption = (index: number, value: string) => {
    setValues((current) => ({ ...current, options: current.options.map((o, i) => (i === index ? value : o)) as Values['options'] }));
    setProblems((current) => current.filter((p) => p.field !== OPTION_FIELDS[index] && p.field !== 'options'));
    setSaved(null);
  };

  const fail = (found: FieldProblem[]) => {
    setProblems(found);
    setSummaryTick((tick) => tick + 1);
  };

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (saving || deleted) return;
    setGeneral(null);
    setStale(false);
    const local = validate(values);
    if (local.length > 0) {
      fail(local);
      return;
    }
    setProblems([]);
    setSaving(true);
    const sent = JSON.stringify(values);
    try {
      const open = editing?.status === 'DRAFT';
      const result = questionId
        ? await saveDraft(questionId, toPayload(values, open ? rowVersion : undefined))
        : await createQuestion(toPayload(values));
      const message = adminT('editor.saved', { version: result.version });
      setBaseline(sent);
      setRowVersion(result.rowVersion);
      setSaved(message);
      announce(message);
      if (!questionId) {
        carriedStatus = message;
        guard.release();
        navigate(`/admin/questions/${result.questionId}/edit`, { replace: true });
      } else {
        // Refresh the header and version history; the typed values stay as they are. The save already
        // succeeded, so a failed refresh must not read as "Could not save": keep the saved row version
        // and tell the admin to reload for the new history.
        try {
          const fresh = await fetchQuestion(questionId);
          setLoad({ status: 'ready', detail: fresh });
          setRowVersion(fresh.editing.rowVersion);
        } catch {
          announce(adminT('editor.refreshFailed'));
        }
      }
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 400 && error.errors.length > 0) fail(error.errors);
      else if (error instanceof AdminApiError && error.status === 409 && questionId && !deleted && error.reason !== 'deleted') {
        setStale(true);
        announce(adminT('editor.stale'));
      } else {
        const text = adminT('editor.saveFailed', { detail: error instanceof AdminApiError && error.detail ? error.detail : '' }).trim();
        setGeneral(text);
      }
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    try {
      const fresh = await fetchDetail();
      if (fresh) {
        apply(fresh);
        setStale(false);
        setProblems([]);
        setSaved(null);
        announce(adminT('editor.reloaded'));
      }
    } catch {
      setGeneral(adminT('editor.loadFailed'));
    }
  };

  const restore = async () => {
    if (!questionId || !detail) return;
    setRestoring(true);
    try {
      await restoreQuestion(questionId);
      announce(adminT('editor.restored', { no: detail.displayNo.toLocaleString('en-US') }));
      const fresh = await fetchQuestion(questionId);
      apply(fresh);
    } catch (error) {
      setGeneral(adminT('editor.restoreFailed', { detail: error instanceof AdminApiError && error.detail ? error.detail : '' }).trim());
    } finally {
      setRestoring(false);
    }
  };

  const errorFor = (field: string): FieldProblem[] => problems.filter((p) => shownUnder(p.field) === field);
  const focusField = (field: string) => {
    const el = document.getElementById(controlId(field));
    el?.focus();
    el?.scrollIntoView?.({ block: 'center' });
  };

  const summaryTitle = adminT('editor.summary', { count: problems.length });

  const heading = (
    <h1 tabIndex={-1} className="font-title text-title">
      {load.status === 'loading' ? adminT('editor.title') : header}
    </h1>
  );

  if (load.status === 'loading') {
    return (
      <main className="flex flex-col gap-4">
        {heading}
        <p role="status">{adminT('editor.loading')}</p>
      </main>
    );
  }
  if (load.status === 'error') {
    return (
      <main className="flex flex-col gap-4">
        {heading}
        <p role="alert">{load.notFound ? adminT('editor.notFound') : (load.detail ?? adminT('editor.loadFailed'))}</p>
        <Link to="/admin" className="underline">
          {adminT('editor.back')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        <Link to="/admin" className="hit-target inline-flex min-h-target-min items-center underline">
          {adminT('editor.back')}
        </Link>
      </div>

      {detail && !deleted ? <ReportBanner questionId={detail.questionId} versions={detail.versions} /> : null}

      {draftRef ? (
        <div role="toolbar" aria-label={adminT('editor.toolbar')} onKeyDown={onToolbarKeyDown} className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-card p-3">
          {myBatch ? (
            myBatch.phase === 'pending' ? (
              <UndoLine
                batch={myBatch}
                autoFocus
                onUndo={() => {
                  if (undoBatch(myBatch.id)) setTimeout(() => publishButton.current?.focus(), 0);
                }}
              />
            ) : null
          ) : (
            <>
              <button ref={publishButton} type="button" aria-keyshortcuts="P" aria-disabled={dirty} onClick={() => draftAction('publish')} className={PRIMARY}>
                {adminT('editor.publish')}
              </button>
              <button type="button" aria-keyshortcuts="D" aria-disabled={dirty} onClick={() => draftAction('discard')} className={BUTTON}>
                {adminT('editor.discard')}
              </button>
              {dirty ? <span className="text-caption text-muted">{adminT('editor.saveFirst')}</span> : null}
            </>
          )}
          {failure ? (
            <p className="font-semibold text-brick">
              <span aria-hidden="true">⚠ </span>
              {adminT('drafts.failed', { detail: failure })}
            </p>
          ) : null}
        </div>
      ) : null}

      {deleted ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-card p-4">
          <p>{adminT('editor.deletedNote')}</p>
          <button type="button" aria-disabled={restoring} onClick={() => !restoring && void restore()} className={PRIMARY}>
            {restoring ? adminT('editor.restoring') : adminT('editor.restore')}
          </button>
        </div>
      ) : null}

      {problems.length > 0 ? (
        <div ref={summary} role="alert" tabIndex={-1} className="rounded-lg border-[1.5px] border-brick bg-card p-4">
          <h2 className="text-body font-bold">
            <span aria-hidden="true">⚠ </span>
            {summaryTitle}
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-6">
            {problems.map((p, i) => (
              <li key={`${p.field}-${i}`}>
                <a
                  href={`#${controlId(p.field)}`}
                  className="underline"
                  onClick={(event) => {
                    event.preventDefault();
                    focusField(p.field);
                  }}
                >
                  {adminT('editor.problemLink', { label: labelOf(p.field), problem: problemText(p) })}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stale ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border-[1.5px] border-brick bg-card p-4">
          <p>
            <span aria-hidden="true">⚠ </span>
            {adminT('editor.stale')}
          </p>
          <button type="button" onClick={() => void reload()} className={BUTTON}>
            {adminT('editor.reload')}
          </button>
        </div>
      ) : null}

      {general ? (
        <p role="alert" className="text-body font-semibold text-brick">
          <span aria-hidden="true">⚠ </span>
          {general}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <form noValidate onSubmit={(event) => void submit(event)} aria-label={adminT('editor.fields')} className="flex flex-col gap-4">
          <fieldset disabled={deleted} className="flex min-w-[0] flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <SelectField name="category" values={values} problems={errorFor('category')} onChange={(v) => set('category', v)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {adminT(`category.${c}` as AdminKey)}
                  </option>
                ))}
              </SelectField>
              <SelectField name="examLevel" values={values} problems={errorFor('examLevel')} onChange={(v) => set('examLevel', v)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {adminT(`level.${l}` as AdminKey)}
                  </option>
                ))}
              </SelectField>
              <SubjectTopic
                values={values}
                subjects={subjects}
                problems={{ subjectId: errorFor('subjectId'), topicId: errorFor('topicId') }}
                onSubject={(id) => setValues((current) => ({ ...current, subjectId: id, topicId: '' }))}
                onTopic={(id) => set('topicId', id)}
                onSubjectProblemsClear={() => setProblems((current) => current.filter((p) => p.field !== 'subjectId'))}
                queryClient={queryClient}
              />
              <SelectField name="difficulty" values={values} problems={errorFor('difficulty')} onChange={(v) => set('difficulty', v)}>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {adminT(`difficulty.${d}` as AdminKey)}
                  </option>
                ))}
              </SelectField>
            </div>

            <TextField name="textMl" lang="ml" rows={3} value={values.textMl} problems={errorFor('textMl')} onChange={(v) => set('textMl', v)} />
            <TextField name="textEn" lang="en" rows={3} value={values.textEn} problems={errorFor('textEn')} onChange={(v) => set('textEn', v)} />

            <fieldset className="flex flex-col gap-2" aria-describedby={errorFor('options').length ? 'q-options-error' : undefined}>
              <legend className="text-label font-bold">{adminT('field.options')}</legend>
              {OPTION_FIELDS.map((field, i) => (
                <InputField
                  key={field}
                  name={field}
                  value={values.options[i] ?? ''}
                  problems={errorFor(field)}
                  invalidGroup={errorFor('options').length > 0}
                  onChange={(v) => setOption(i, v)}
                />
              ))}
              <FieldProblems id="q-options-error" problems={errorFor('options')} />
            </fieldset>

            <AnswerField value={values.answerIndex} problems={errorFor('answerIndex')} onChange={(v) => set('answerIndex', v)} />

            <TextField name="explanation" rows={3} value={values.explanation} problems={errorFor('explanation')} onChange={(v) => set('explanation', v)} />
            <InputField
              name="attribution"
              placeholder={adminT('field.attributionPlaceholder')}
              value={values.attribution}
              problems={errorFor('attribution')}
              onChange={(v) => set('attribution', v)}
            />
            <InputField
              name="sourceRef"
              value={values.sourceRef}
              problems={errorFor('sourceRef')}
              readOnly={questionId !== null}
              hint={questionId !== null ? adminT('field.sourceRefLocked') : undefined}
              onChange={(v) => set('sourceRef', v)}
            />
          </fieldset>

          {!deleted ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" aria-disabled={saving} className={PRIMARY}>
                {saving ? adminT('editor.saving') : adminT('editor.save')}
              </button>
              {dirty ? <span className="text-caption text-muted">{adminT('editor.dirty')}</span> : null}
              {saved && !dirty ? <span className="text-caption text-ink">{saved}</span> : null}
            </div>
          ) : null}
        </form>

        <QuestionPreview values={values} />
      </div>

      {detail ? (
        <section aria-labelledby="history-title" className="flex flex-col gap-2">
          <h2 id="history-title" className="text-label font-bold">
            {adminT('history.title')}
          </h2>
          <table className="w-full border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-ink">
                {(['history.version', 'history.status', 'history.createdBy', 'history.createdAt', 'history.publishedBy', 'history.publishedAt', 'history.discardedBy', 'history.discardedAt'] as const).map((key) => (
                  <th key={key} scope="col" className="px-2 py-1 text-label font-bold">
                    {adminT(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.versions.map((v) => (
                <tr key={v.version} className="border-b border-hairline">
                  <th scope="row" className="px-2 py-1 text-left font-normal">
                    {adminT('history.versionLabel', { version: v.version })}
                  </th>
                  <td className="px-2 py-1">{adminT(`state.${v.status}` as AdminKey)}</td>
                  <td className="px-2 py-1">{v.createdBy === 'seed' ? adminT('history.seed') : v.createdBy}</td>
                  <td className="px-2 py-1">{new Date(v.createdAt).toLocaleString('en-GB')}</td>
                  <td className="px-2 py-1">{v.publishedBy === 'seed' ? adminT('history.seed') : (v.publishedBy ?? adminT('history.none'))}</td>
                  <td className="px-2 py-1">{v.publishedAt ? new Date(v.publishedAt).toLocaleString('en-GB') : adminT('history.none')}</td>
                  <td className="px-2 py-1">{v.discardedBy ?? adminT('history.none')}</td>
                  <td className="px-2 py-1">{v.discardedAt ? new Date(v.discardedAt).toLocaleString('en-GB') : adminT('history.none')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {guard.asking ? (
        <ConfirmDialog title={adminT('leave.title')} cancelLabel={adminT('leave.stay')} confirmLabel={adminT('leave.leave')} onCancel={guard.stay} onConfirm={guard.leave} />
      ) : null}
    </main>
  );
}
