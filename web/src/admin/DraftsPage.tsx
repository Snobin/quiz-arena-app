import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Skeleton } from '../design/Skeleton.tsx';
import { Link } from '../shell/Link.tsx';
import { navigate } from '../shell/router.ts';
import { adminT, type AdminKey } from './adminI18n.ts';
import { AdminApiError, fetchDrafts, type AdminDraft } from './api.ts';
import { queueAction, refKey, setReturnFocus, takeReturnFocus, undoBatch, useDraftActions, type Batch } from './draftActions.ts';
import { UndoLine } from './UndoLine.tsx';
import { HelpDialog } from './HelpDialog.tsx';
import { textFor } from './QuestionPreview.tsx';
import { shortcutFrom } from './shortcuts.ts';
import { useAdminTitle } from './useAdminTitle.ts';

const BUTTON = 'hit-target inline-flex min-h-target-min items-center rounded-md border-[1.5px] border-ink bg-card px-4 text-body';
const PRIMARY = 'hit-target inline-flex min-h-target-min items-center rounded-md bg-band px-4 text-body text-on-band';
const HEADING = '__heading__';

const number = (n: number) => n.toLocaleString('en-US');
const keyOf = (draft: AdminDraft) => refKey(draft);

function Tags({ draft }: { draft: AdminDraft }) {
  const c = draft.content;
  const tags = [
    adminT(`category.${c.category}` as AdminKey),
    c.subject,
    c.topic,
    adminT(`level.${c.examLevel}` as AdminKey),
    adminT(`difficulty.${c.difficulty}` as AdminKey),
  ];
  return (
    <ul className="flex flex-wrap gap-1">
      {tags.map((tag, index) => (
        <li key={index} className="rounded-sm border border-hairline px-2 text-caption">
          {tag}
        </li>
      ))}
    </ul>
  );
}

/** The question in both languages with their `lang` attributes, the options (correct one marked), explanation and source. */
function Preview({ draft }: { draft: AdminDraft }) {
  const c = draft.content;
  const values = { textMl: c.textMl ?? '', textEn: c.textEn ?? '' };
  return (
    <div className="flex flex-col gap-2">
      {(['ml', 'en'] as const).map((lang) => {
        const { text, fellBack } = textFor(values, lang);
        return (
          <div key={lang}>
            <h3 className="text-caption text-muted">{adminT(lang === 'ml' ? 'preview.ml' : 'preview.en')}</h3>
            {text ? (
              <p lang={fellBack ? (lang === 'ml' ? 'en' : 'ml') : lang} className="font-question text-question">
                {text}
              </p>
            ) : (
              <p className="text-muted">{adminT('preview.empty')}</p>
            )}
            {fellBack ? <p className="text-caption font-semibold">{adminT(lang === 'ml' ? 'preview.fallback.ml' : 'preview.fallback.en')}</p> : null}
          </div>
        );
      })}
      <ol className="flex list-[upper-alpha] flex-col gap-1 pl-6 font-option text-option">
        {c.options.map((option, index) => (
          <li key={index} className={index === c.answerIndex ? 'font-bold' : undefined}>
            {option}
            {index === c.answerIndex ? <span> ✓ ({adminT('detail.correct')})</span> : null}
          </li>
        ))}
      </ol>
      <p className="text-explanation">{c.explanation}</p>
      <p className="text-caption text-muted">{c.attribution ?? adminT('drafts.sourceNa')}</p>
    </div>
  );
}

function change(draft: AdminDraft): string {
  if (draft.replacesVersion === null) return adminT('drafts.new');
  if (draft.changedFields.length === 0) return adminT('drafts.replacesNone', { version: draft.replacesVersion });
  const fields = draft.changedFields.map((field) => adminT(`changed.${field}` as AdminKey)).join(', ');
  return adminT('drafts.replaces', { version: draft.replacesVersion, fields });
}

type RowProps = {
  draft: AdminDraft;
  tabbable: boolean;
  selected: boolean;
  failure: string | undefined;
  register: (key: string, element: HTMLTableRowElement | null) => void;
  onFocus: () => void;
  onSelect: (on: boolean) => void;
  onPublish: () => void;
  onDiscard: () => void;
  onEdit: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
};

function Row({ draft, tabbable, selected, failure, register, onFocus, onSelect, onPublish, onDiscard, onEdit, onKeyDown }: RowProps) {
  const label = { no: number(draft.displayNo), version: draft.version };
  return (
    <tr
      ref={(element) => register(keyOf(draft), element)}
      tabIndex={tabbable ? 0 : -1}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className="border-b border-hairline align-top"
    >
      <td className="px-2 py-2">
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} aria-label={adminT('drafts.selectRow', label)} className="size-5" />
      </td>
      <th scope="row" className="px-2 py-2 text-left font-bold whitespace-nowrap">
        {adminT('drafts.id', label)}
      </th>
      <td className="px-2 py-2">
        <Preview draft={draft} />
        {failure ? (
          <p className="mt-2 font-semibold text-brick">
            <span aria-hidden="true">⚠ </span>
            {failure}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-2">
        <Tags draft={draft} />
      </td>
      <td className="px-2 py-2">{change(draft)}</td>
      <td className="px-2 py-2 whitespace-nowrap">{adminT('drafts.createdBy', { who: draft.createdBy, when: new Date(draft.createdAt).toLocaleDateString('en-GB') })}</td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-keyshortcuts="P" aria-label={adminT('drafts.publishLabel', label)} onClick={onPublish} className={PRIMARY}>
            {adminT('drafts.publish')}
          </button>
          <button type="button" aria-keyshortcuts="D" aria-label={adminT('drafts.discardLabel', label)} onClick={onDiscard} className={BUTTON}>
            {adminT('drafts.discard')}
          </button>
          <Link
            to={`/admin/questions/${draft.questionId}/edit`}
            aria-keyshortcuts="E"
            aria-label={adminT('drafts.editLabel', label)}
            onClick={onEdit}
            className="hit-target inline-flex min-h-target-min items-center underline"
          >
            {adminT('drafts.edit')}
          </Link>
        </div>
      </td>
    </tr>
  );
}

/**
 * The draft review queue: every open draft, oldest first. Publish and Discard (buttons, or P and D on a focused
 * row) collapse the row for 5 s with an Undo and send the request only when the window passes.
 */
export function DraftsPage() {
  useAdminTitle(adminT('nav.drafts'));
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'drafts'], queryFn: fetchDrafts, retry: false });
  const batches = useDraftActions((s) => s.batches);
  const failures = useDraftActions((s) => s.failures);
  const heading = useRef<HTMLHeadingElement>(null);
  const rowEls = useRef(new Map<string, HTMLTableRowElement>());
  const selectAll = useRef<HTMLInputElement>(null);
  const returned = useRef(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const items = query.data?.items ?? [];
  const batchOf = new Map<string, Batch>();
  for (const batch of batches) for (const ref of batch.refs) batchOf.set(refKey(ref), batch);
  const live = items.filter((draft) => !batchOf.has(keyOf(draft)));
  const bulkLines = batches.filter((b) => b.bulk && b.phase === 'pending');
  const tabbableKey = live.some((d) => keyOf(d) === activeKey) ? activeKey : live[0] ? keyOf(live[0]) : null;
  const chosen = live.filter((d) => selected.has(keyOf(d)));

  // Rows that left the list (committed, or deleted elsewhere) drop out of the selection.
  useEffect(() => {
    setSelected((current) => {
      const present = new Set(items.map(keyOf));
      const next = new Set([...current].filter((key) => present.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = chosen.length > 0 && chosen.length < live.length;
  });

  // Back from the editor: focus returns to the draft that was being edited.
  useEffect(() => {
    if (returned.current || !query.data) return;
    returned.current = true;
    const key = takeReturnFocus();
    if (key && query.data.items.some((d) => keyOf(d) === key)) {
      setActiveKey(key);
      setFocusKey(key);
    }
  }, [query.data]);

  useEffect(() => {
    if (!focusKey) return;
    if (focusKey === HEADING) heading.current?.focus();
    else rowEls.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey, batches, items]);

  const register = (key: string, element: HTMLTableRowElement | null) => {
    if (element) rowEls.current.set(key, element);
    else rowEls.current.delete(key);
  };

  /** Starts a delayed action on `rows`, then moves focus to the next row, the previous one, or the heading. */
  const act = (action: 'publish' | 'discard', rows: AdminDraft[], bulk: boolean) => {
    if (rows.length === 0) return;
    const gone = new Set(rows.map(keyOf));
    const remaining = live.filter((d) => !gone.has(keyOf(d)));
    const lastIndex = Math.max(...rows.map((d) => live.indexOf(d)));
    const target = remaining.find((d) => live.indexOf(d) > lastIndex) ?? remaining[remaining.length - 1];
    queueAction(queryClient, action, rows.map((d) => ({ questionId: d.questionId, version: d.version, displayNo: d.displayNo })), bulk);
    setSelected((current) => new Set([...current].filter((key) => !gone.has(key))));
    const next = target ? keyOf(target) : HEADING;
    setActiveKey(next === HEADING ? null : next);
    setFocusKey(next);
  };

  const undo = (batch: Batch) => {
    if (!undoBatch(batch.id)) return;
    const first = refKey(batch.refs[0] as Batch['refs'][number]);
    setActiveKey(first);
    setFocusKey(first);
  };

  const move = (draft: AdminDraft, step: 1 | -1) => {
    const index = live.indexOf(draft) + step;
    const target = live[index];
    if (!target) return; // stay put at the ends
    setActiveKey(keyOf(target));
    setFocusKey(keyOf(target));
  };

  const edit = (draft: AdminDraft) => {
    setReturnFocus(keyOf(draft));
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, draft: AdminDraft) => {
    const key = shortcutFrom(event);
    if (!key) return;
    if (key === 'p' || key === 'd') act(key === 'p' ? 'publish' : 'discard', [draft], false);
    else if (key === 'e') {
      edit(draft);
      navigate(`/admin/questions/${draft.questionId}/edit`);
    } else if (key === 'j' || key === 'k') move(draft, key === 'j' ? 1 : -1);
    else return;
    event.preventDefault();
  };

  const onPageKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (shortcutFrom(event) === '?') {
      event.preventDefault();
      setHelp(true);
    }
  };

  const toggle = (key: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const allChosen = live.length > 0 && chosen.length === live.length;

  return (
    <main className="flex flex-col gap-4" onKeyDown={onPageKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="font-title text-title">
          {adminT('drafts.title')}
        </h1>
        <button type="button" onClick={() => setHelp(true)} className={BUTTON}>
          {adminT('shortcuts.open')}
        </button>
      </div>

      {query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-brick bg-card p-4">
          <p>{adminT('drafts.loadFailed')}</p>
          <p>{query.error instanceof AdminApiError && query.error.detail ? query.error.detail : adminT('error.unknown')}</p>
          <button type="button" className={BUTTON} onClick={() => void query.refetch()}>
            {adminT('error.retry')}
          </button>
        </div>
      ) : !query.data ? (
        <Skeleton rows={Array.from({ length: 6 }, () => ({ kind: 'text' as const }))} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p>{adminT('drafts.empty')}</p>
          <div className="flex gap-4">
            <Link to="/admin/upload" className="underline">
              {adminT('drafts.emptyUpload')}
            </Link>
            <Link to="/admin/questions/new" className="underline">
              {adminT('drafts.emptyAdd')}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {query.data.totalItems > items.length ? (
            <p className="text-caption text-muted">{adminT('drafts.truncated', { shown: number(items.length), total: number(query.data.totalItems) })}</p>
          ) : null}
          <div role="group" aria-label={adminT('drafts.bulk')} className="flex flex-wrap items-center gap-3">
            <button type="button" aria-disabled={chosen.length === 0} onClick={() => chosen.length > 0 && act('publish', chosen, true)} className={PRIMARY}>
              {adminT('drafts.publishSelected', { count: chosen.length })}
            </button>
            <button type="button" aria-disabled={chosen.length === 0} onClick={() => chosen.length > 0 && act('discard', chosen, true)} className={BUTTON}>
              {adminT('drafts.discardSelected', { count: chosen.length })}
            </button>
          </div>
          {bulkLines.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {bulkLines.map((batch) => (
                <li key={batch.id}>
                  <UndoLine batch={batch} onUndo={() => undo(batch)} />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-body">
              <caption className="pb-2 text-left text-caption text-muted">{adminT('drafts.caption')}</caption>
              <thead>
                <tr className="border-b border-ink">
                  <th scope="col" className="px-2 py-2">
                    <input
                      ref={selectAll}
                      type="checkbox"
                      checked={allChosen}
                      onChange={(event) => setSelected(event.target.checked ? new Set(live.map(keyOf)) : new Set())}
                      aria-label={adminT('drafts.selectAll')}
                      className="size-5"
                    />
                  </th>
                  {(['drafts.col.draft', 'drafts.col.preview', 'drafts.col.tags', 'drafts.col.change', 'drafts.col.created', 'drafts.col.actions'] as const).map((key) => (
                    <th key={key} scope="col" className="px-2 py-2 text-label font-bold">
                      {adminT(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((draft) => {
                  const key = keyOf(draft);
                  const batch = batchOf.get(key);
                  if (batch) {
                    return batch.bulk || batch.phase !== 'pending' ? null : (
                      <tr key={key} className="border-b border-hairline">
                        <td colSpan={7} className="px-2 py-2">
                          <UndoLine batch={batch} onUndo={() => undo(batch)} />
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <Row
                      key={key}
                      draft={draft}
                      tabbable={key === tabbableKey}
                      selected={selected.has(key)}
                      failure={failures[key] ? adminT('drafts.failed', { detail: failures[key] }) : undefined}
                      register={register}
                      onFocus={() => setActiveKey(key)}
                      onSelect={(on) => toggle(key, on)}
                      onPublish={() => act('publish', [draft], false)}
                      onDiscard={() => act('discard', [draft], false)}
                      onEdit={() => edit(draft)}
                      onKeyDown={(event) => onRowKeyDown(event, draft)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {help ? <HelpDialog onClose={() => setHelp(false)} /> : null}
    </main>
  );
}
