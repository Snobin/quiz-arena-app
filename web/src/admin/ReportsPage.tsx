import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Skeleton } from '../design/Skeleton.tsx';
import { Link } from '../shell/Link.tsx';
import { adminT, type AdminKey } from './adminI18n.ts';
import { AdminApiError, fetchReports, type AdminReport, type AdminReportGroup } from './api.ts';
import { groupKey, queueDismiss, undoDismiss, useReportActions, type DismissBatch } from './reportActions.ts';
import { useReportTab, type ReportTab } from './reportTab.ts';
import { useAdminTitle } from './useAdminTitle.ts';

const BUTTON = 'hit-target inline-flex min-h-target-min items-center rounded-md border-[1.5px] border-ink bg-card px-4 text-body';
const PRIMARY = 'hit-target inline-flex min-h-target-min items-center rounded-md bg-band px-4 text-body text-on-band';
const HEADING = '__heading__';
export const NOTE_MAX = 500;

const number = (n: number) => n.toLocaleString('en-US');
const when = (iso: string) => new Date(iso).toLocaleString('en-GB');
const idLabel = (g: AdminReportGroup) => ({ no: number(g.displayNo), version: g.version });

/** "Dismissed reports on Q 1234 v2 · Undo": what a group collapses to for 5 s. */
function DismissUndoLine({ batch, onUndo }: { batch: DismissBatch; onUndo: () => void }) {
  const text = adminT('reports.done', { no: number(batch.ref.displayNo), version: batch.ref.version });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{text}</span>
      <span aria-hidden="true">·</span>
      <button type="button" aria-label={adminT('drafts.undoLabel', { text })} onClick={onUndo} className="hit-target inline-flex min-h-target-min items-center font-bold underline">
        {adminT('drafts.undo')}
      </button>
    </span>
  );
}

function Question({ group }: { group: AdminReportGroup }) {
  if (!group.textMl && !group.textEn) return <span className="text-muted">{adminT('preview.empty')}</span>;
  return (
    <div className="flex flex-col gap-1">
      {group.textMl ? (
        <p lang="ml" className="font-question text-question">
          {group.textMl}
        </p>
      ) : null}
      {group.textEn ? (
        <p lang="en" className="font-question text-question">
          {group.textEn}
        </p>
      ) : null}
    </div>
  );
}

function Tags({ group }: { group: AdminReportGroup }) {
  const tags: string[] = [];
  if (group.currentPublishedVersion !== null && group.currentPublishedVersion > group.version) {
    tags.push(adminT('reports.tag.superseded', { version: group.currentPublishedVersion }));
  }
  if (group.pendingDraftVersion !== null) tags.push(adminT('reports.tag.draft', { version: group.pendingDraftVersion }));
  if (tags.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li key={tag} className="rounded-sm border border-hairline px-2 text-caption">
          {tag}
        </li>
      ))}
    </ul>
  );
}

/** A report's note is plain text: React escapes it, and it is never set as HTML. */
function ReportItem({ report }: { report: AdminReport }) {
  return (
    <li className="flex flex-col gap-1 border-t border-hairline py-2">
      <p className="whitespace-pre-wrap">{report.note ?? adminT('reports.noNote')}</p>
      <p className="text-caption text-muted">
        {report.reporterName} · {adminT(`reports.surface.${report.surface}` as AdminKey)} · {when(report.createdAt)}
      </p>
      {report.status !== 'OPEN' ? (
        <p className="text-caption">
          <span className="font-bold">
            {report.status === 'RESOLVED_FIXED'
              ? adminT('reports.fixedIn', { version: report.fixedByVersion ?? '' })
              : adminT('reports.dismissed', { note: report.resolutionNote ?? '' })}
          </span>
          {' · '}
          {adminT('reports.closedBy', { who: report.resolvedBy ?? adminT('bar.adminFallback'), when: report.resolvedAt ? when(report.resolvedAt) : '' })}
        </p>
      ) : null}
    </li>
  );
}

type RowProps = {
  group: AdminReportGroup;
  closed: boolean;
  tabbable: boolean;
  expanded: boolean;
  dismissing: boolean;
  failure: string | undefined;
  register: (key: string, element: HTMLTableRowElement | null) => void;
  onFocus: () => void;
  onToggle: () => void;
  onStartDismiss: () => void;
  onCancelDismiss: () => void;
  onConfirm: (note: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => void;
};

function Row({ group, closed, tabbable, expanded, dismissing, failure, register, onFocus, onToggle, onStartDismiss, onCancelDismiss, onConfirm, onKeyDown }: RowProps) {
  const key = groupKey(group);
  const label = idLabel(group);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const showReports = closed || expanded;
  const noteId = `note-${key}`;

  useEffect(() => {
    if (dismissing) field.current?.focus();
  }, [dismissing]);

  const confirm = () => {
    const trimmed = note.trim();
    const length = [...trimmed].length;
    if (length === 0) setProblem(adminT('reports.noteRequired'));
    else if (length > NOTE_MAX) setProblem(adminT('reports.noteTooLong', { count: length }));
    else {
      setProblem(null);
      onConfirm(trimmed);
    }
  };

  return (
    <Fragment>
      <tr ref={(element) => register(key, element)} tabIndex={tabbable ? 0 : -1} onFocus={onFocus} onKeyDown={onKeyDown} className="border-t border-hairline align-top">
        <th scope="row" className="px-2 py-2 text-left font-bold whitespace-nowrap">
          {adminT('reports.id', label)}
          <Tags group={group} />
        </th>
        <td className="px-2 py-2">
          <Question group={group} />
          {failure ? (
            <p className="mt-2 font-semibold text-brick">
              <span aria-hidden="true">⚠ </span>
              {adminT('reports.failed', { detail: failure })}
            </p>
          ) : null}
        </td>
        <td className="px-2 py-2">{group.reportCount}</td>
        <td className="px-2 py-2 whitespace-nowrap">{when(group.firstReportedAt)}</td>
        <td className="px-2 py-2 whitespace-nowrap">{when(group.lastReportedAt)}</td>
        <td className="px-2 py-2">
          <div className="flex flex-wrap gap-2">
            {closed ? null : (
              <button type="button" aria-expanded={expanded} aria-label={adminT(expanded ? 'reports.collapse' : 'reports.expand', label)} onClick={onToggle} className={BUTTON}>
                {expanded ? '▾' : '▸'} {group.reportCount}
              </button>
            )}
            {closed ? null : (
              <Link to={`/admin/questions/${group.questionId}/edit?reportedVersion=${group.version}`} aria-label={adminT('reports.openInEditorLabel', label)} className={PRIMARY}>
                {adminT('reports.openInEditor')}
              </Link>
            )}
            {closed ? null : (
              <button type="button" aria-label={adminT('reports.dismissLabel', label)} aria-expanded={dismissing} onClick={onStartDismiss} className={BUTTON}>
                {adminT('reports.dismiss')}
              </button>
            )}
          </div>
        </td>
      </tr>
      {showReports || dismissing ? (
        <tr>
          <td colSpan={6} className="px-2 pb-2">
            {showReports ? (
              <ul aria-label={adminT('reports.expand', label)} className="flex flex-col">
                {group.reports.map((report) => (
                  <ReportItem key={report.reportId} report={report} />
                ))}
              </ul>
            ) : null}
            {dismissing ? (
              <div className="mt-2 flex max-w-xl flex-col gap-2">
                <label htmlFor={noteId} className="font-bold">
                  {adminT('reports.noteLabel')}
                </label>
                <textarea
                  id={noteId}
                  ref={field}
                  value={note}
                  rows={3}
                  aria-invalid={problem !== null}
                  aria-describedby={`${noteId}-count${problem ? ` ${noteId}-error` : ''}`}
                  onChange={(event) => setNote(event.target.value)}
                  className="rounded-md border-[1.5px] border-ink bg-card p-2 text-body"
                />
                <p id={`${noteId}-count`} className="text-caption text-muted">
                  {adminT('reports.noteCount', { count: [...note].length })}
                </p>
                {problem ? (
                  <p id={`${noteId}-error`} role="alert" className="font-semibold text-brick">
                    {problem}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button type="button" onClick={confirm} className={PRIMARY}>
                    {adminT('reports.confirm')}
                  </button>
                  <button type="button" onClick={onCancelDismiss} className={BUTTON}>
                    {adminT('reports.cancel')}
                  </button>
                </div>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/**
 * The report queue: groups per question version, Open and Closed tabs in the URL. Dismiss asks for a note inline,
 * then collapses the group for 5 s with an Undo and sends the request only when the window passes.
 */
export function ReportsPage() {
  useAdminTitle(adminT('nav.reports'));
  const queryClient = useQueryClient();
  const [tab, setTab] = useReportTab();
  const closed = tab === 'closed';
  const query = useQuery({ queryKey: ['admin', 'reports', tab], queryFn: () => fetchReports(closed ? 'CLOSED' : 'OPEN'), retry: false });
  const batches = useReportActions((s) => s.batches);
  const failures = useReportActions((s) => s.failures);
  const heading = useRef<HTMLHeadingElement>(null);
  const rowEls = useRef(new Map<string, HTMLTableRowElement>());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const items = query.data?.items ?? [];
  const batchOf = new Map<string, DismissBatch>();
  for (const batch of batches) batchOf.set(groupKey(batch.ref), batch);
  const live = items.filter((g) => !batchOf.has(groupKey(g)));
  const tabbableKey = live.some((g) => groupKey(g) === activeKey) ? activeKey : live[0] ? groupKey(live[0]) : null;

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

  const confirm = (group: AdminReportGroup, note: string) => {
    const remaining = live.filter((g) => g !== group);
    const index = live.indexOf(group);
    const target = remaining.find((g) => live.indexOf(g) > index) ?? remaining[remaining.length - 1];
    queueDismiss(queryClient, { questionId: group.questionId, version: group.version, displayNo: group.displayNo, note });
    setDismissing(null);
    const next = target ? groupKey(target) : HEADING;
    setActiveKey(next === HEADING ? null : next);
    setFocusKey(next);
  };

  const undo = (batch: DismissBatch) => {
    if (!undoDismiss(batch.id)) return;
    const key = groupKey(batch.ref);
    setActiveKey(key);
    setFocusKey(key);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, group: AdminReportGroup) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const target = live[live.indexOf(group) + (event.key === 'ArrowDown' ? 1 : -1)];
    event.preventDefault();
    if (!target) return;
    setActiveKey(groupKey(target));
    setFocusKey(groupKey(target));
  };

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const tabButton = (value: ReportTab) => (
    <button
      key={value}
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={['hit-target inline-flex min-h-target-min items-center rounded-md px-4 text-body', tab === value ? 'font-bold underline' : 'text-muted'].join(' ')}
    >
      {adminT(value === 'open' ? 'reports.tab.open' : 'reports.tab.closed')}
    </button>
  );

  return (
    <main className="flex flex-col gap-4">
      <h1 ref={heading} tabIndex={-1} className="font-title text-title">
        {adminT('reports.title')}
      </h1>
      <div role="tablist" aria-label={adminT('reports.tabs')} className="flex gap-2">
        {tabButton('open')}
        {tabButton('closed')}
      </div>

      {query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-brick bg-card p-4">
          <p>{adminT('reports.loadFailed')}</p>
          <p>{query.error instanceof AdminApiError && query.error.detail ? query.error.detail : adminT('error.unknown')}</p>
          <button type="button" className={BUTTON} onClick={() => void query.refetch()}>
            {adminT('error.retry')}
          </button>
        </div>
      ) : !query.data ? (
        <Skeleton rows={Array.from({ length: 4 }, () => ({ kind: 'text' as const }))} />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p>{adminT(closed ? 'reports.empty.closed' : 'reports.empty.open')}</p>
          {closed ? null : (
            <button type="button" onClick={() => setTab('closed')} className="hit-target inline-flex min-h-target-min items-center underline">
              {adminT('reports.emptyClosedLink')}
            </button>
          )}
        </div>
      ) : (
        <>
          {query.data.totalItems > items.length ? (
            <p className="text-caption text-muted">{adminT('reports.truncated', { shown: number(items.length), total: number(query.data.totalItems) })}</p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-body">
              <caption className="pb-2 text-left text-caption text-muted">{adminT(closed ? 'reports.caption.closed' : 'reports.caption.open')}</caption>
              <thead>
                <tr className="border-b border-ink">
                  {(['reports.col.group', 'reports.col.text', 'reports.col.count', 'reports.col.first', 'reports.col.last', 'reports.col.actions'] as const).map((key) => (
                    <th key={key} scope="col" className="px-2 py-2 text-label font-bold">
                      {adminT(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((group) => {
                  const key = groupKey(group);
                  const batch = batchOf.get(key);
                  if (batch) {
                    return batch.phase === 'pending' ? (
                      <tr key={key} className="border-t border-hairline">
                        <td colSpan={6} className="px-2 py-2">
                          <DismissUndoLine batch={batch} onUndo={() => undo(batch)} />
                        </td>
                      </tr>
                    ) : null;
                  }
                  return (
                    <Row
                      key={key}
                      group={group}
                      closed={closed}
                      tabbable={key === tabbableKey}
                      expanded={expanded.has(key)}
                      dismissing={dismissing === key}
                      failure={failures[key]}
                      register={register}
                      onFocus={() => setActiveKey(key)}
                      onToggle={() => toggle(key)}
                      onStartDismiss={() => setDismissing(dismissing === key ? null : key)}
                      onCancelDismiss={() => setDismissing(null)}
                      onConfirm={(note) => confirm(group, note)}
                      onKeyDown={(event) => onRowKeyDown(event, group)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
