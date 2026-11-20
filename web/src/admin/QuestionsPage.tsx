import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { announce } from '../shell/announce.ts';
import { Link } from '../shell/Link.tsx';
import { Skeleton } from '../design/Skeleton.tsx';
import { adminT } from './adminI18n.ts';
import { AdminApiError, deleteQuestion, fetchQuestions, fetchSubjects, type AdminQuestion } from './api.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { apiSearch, EMPTY_FILTERS, isFiltered, PAGE_SIZE, useFilters, type Filters } from './filters.ts';
import { useAdminTitle } from './useAdminTitle.ts';

const STATES = ['PUBLISHED', 'DRAFT', 'DISCARDED', 'DELETED'] as const;
const CATEGORIES = ['KERALA_PSC', 'SCHOOL_QUIZ', 'GENERAL_KERALA'] as const;
const LEVELS = ['TENTH', 'DEGREE', 'OTHER'] as const;
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

const CONTROL = 'min-h-target-min rounded-md border-[1.5px] border-control-edge bg-card px-2 text-body text-ink';
const BUTTON = 'hit-target inline-flex min-h-target-min items-center rounded-md border-[1.5px] border-ink bg-card px-4 text-body';

const number = (n: number) => n.toLocaleString('en-US');

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-label">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={CONTROL}>
        <option value="">{adminT('filter.any')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuestionText({ question }: { question: AdminQuestion }) {
  return (
    <>
      {question.textMl ? (
        <p lang="ml" className="line-clamp-2">
          {question.textMl}
        </p>
      ) : null}
      {question.textEn ? (
        <p lang="en" className="line-clamp-2">
          {question.textEn}
        </p>
      ) : null}
    </>
  );
}

function Detail({ question }: { question: AdminQuestion }) {
  const tags = [
    adminT(`category.${question.category}` as 'category.KERALA_PSC'),
    question.subject,
    question.topic,
    adminT(`level.${question.examLevel}` as 'level.TENTH'),
    adminT(`difficulty.${question.difficulty}` as 'difficulty.EASY'),
  ];
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-label text-muted">{adminT('detail.malayalam')}</h3>
          <p lang="ml" className="font-option text-option">
            {question.textMl ?? adminT('detail.missing')}
          </p>
        </div>
        <div>
          <h3 className="text-label text-muted">{adminT('detail.english')}</h3>
          <p lang="en" className="text-body">
            {question.textEn ?? adminT('detail.missing')}
          </p>
        </div>
      </div>
      <div>
        <h3 className="text-label text-muted">{adminT('detail.options')}</h3>
        <ol className="flex list-[upper-alpha] flex-col gap-1 pl-6">
          {question.options.map((option, index) => (
            <li key={index} lang="ml" className={index === question.answerIndex ? 'font-bold' : undefined}>
              {option}
              {index === question.answerIndex ? <span> ✓ ({adminT('detail.correct')})</span> : null}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h3 className="text-label text-muted">{adminT('detail.explanation')}</h3>
        <p lang="ml" className="text-explanation">
          {question.explanation}
        </p>
      </div>
      {question.publishedBy ? (
        <p className="text-caption text-muted">
          {adminT('detail.published', {
            who: question.publishedBy === 'seed' ? adminT('history.seed') : question.publishedBy,
            when: question.publishedAt ? new Date(question.publishedAt).toLocaleString('en-GB') : adminT('history.none'),
          })}
        </p>
      ) : null}
      {question.discardedBy ? (
        <p className="text-caption text-muted">
          {adminT('detail.discarded', {
            who: question.discardedBy,
            when: question.discardedAt ? new Date(question.discardedAt).toLocaleString('en-GB') : adminT('history.none'),
          })}
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <li key={index} className="rounded-sm border border-hairline px-2 text-caption">
            {tag}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ question, open, onToggle, onDelete }: { question: AdminQuestion; open: boolean; onToggle: () => void; onDelete: () => void }) {
  const detailId = `q-detail-${question.questionId}`;
  const no = number(question.displayNo);
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    // Enter on the focused row itself (not on a control inside it) toggles the details.
    if (event.key === 'Enter' && event.target === event.currentTarget) {
      event.preventDefault();
      onToggle();
    }
  };
  return (
    <Fragment>
      <tr tabIndex={0} onKeyDown={onKeyDown} className="border-b border-hairline align-top">
        <th scope="row" className="px-2 py-2 text-left font-bold whitespace-nowrap">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={adminT(open ? 'row.collapse' : 'row.expand', { no })}
            onClick={onToggle}
            className="hit-target mr-2 inline-flex min-h-target-min items-center"
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          </button>
          {adminT('row.number', { no })}
        </th>
        <td className="px-2 py-2">
          <QuestionText question={question} />
        </td>
        <td className="px-2 py-2">
          {question.subject} · {question.topic}
        </td>
        <td className="px-2 py-2">{adminT(`level.${question.examLevel}` as 'level.TENTH')}</td>
        <td className="px-2 py-2">{adminT(`difficulty.${question.difficulty}` as 'difficulty.EASY')}</td>
        <td className="px-2 py-2">
          <span>{adminT(`state.${question.state}` as 'state.DRAFT')}</span>
          {question.hasPendingDraft ? (
            <span className="ml-2 rounded-sm border border-ink px-2 text-caption whitespace-nowrap">
              {adminT('row.draftPending', { version: question.pendingDraftVersion ?? question.currentVersion })}
            </span>
          ) : null}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">{new Date(question.updatedAt).toLocaleDateString('en-GB')}</td>
        <td className="px-2 py-2 whitespace-nowrap">
          <Link to={`/admin/questions/${question.questionId}/edit`} aria-label={adminT('row.editLabel', { no })} className="hit-target mr-2 inline-flex min-h-target-min items-center underline">
            {adminT('row.edit')}
          </Link>
          {question.state === 'DELETED' ? null : (
            <button type="button" aria-label={adminT('row.deleteLabel', { no })} onClick={onDelete} className="hit-target inline-flex min-h-target-min items-center font-bold text-brick">
              {adminT('row.delete')}
            </button>
          )}
        </td>
      </tr>
      {open ? (
        <tr id={detailId} className="border-b border-hairline bg-card">
          <td colSpan={8} className="px-4">
            <Detail question={question} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/** The Questions page: filters in the URL, a table of the whole bank, and pagination. */
export function QuestionsPage() {
  useAdminTitle(adminT('nav.questions'));
  const [filters, setFilters] = useFilters();
  const heading = useRef<HTMLHeadingElement>(null);
  const [typed, setTyped] = useState(filters.q);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<AdminQuestion | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    const no = number(deleting.displayNo);
    setDeleteBusy(true);
    try {
      await deleteQuestion(deleting.questionId);
      announce(adminT('row.deleted', { no }));
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] });
      setDeleting(null);
      queueMicrotask(() => heading.current?.focus());
    } catch (error) {
      setDeleteError(adminT('row.deleteFailed', { no, detail: error instanceof AdminApiError && error.detail ? error.detail : '' }).trim());
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  // The search box follows the URL (Back, Clear), and writes to it 300 ms after typing stops.
  useEffect(() => setTyped(filters.q), [filters.q]);
  useEffect(() => {
    if (typed === filters.q) return;
    const timer = setTimeout(() => setFilters({ q: typed }, { replace: true }), 300);
    return () => clearTimeout(timer);
  }, [typed, filters.q, setFilters]);

  const search = apiSearch(filters);
  const questions = useQuery({ queryKey: ['admin', 'questions', search], queryFn: () => fetchQuestions(search), retry: false, placeholderData: keepPreviousData });
  const subjects = useQuery({ queryKey: ['admin', 'subjects'], queryFn: fetchSubjects, retry: false });
  const data = questions.data;
  const showing = questions.isPlaceholderData ? undefined : data;

  useEffect(() => {
    if (showing) announce(adminT('count', { count: showing.totalItems }));
  }, [showing]);

  // A stale ?page= past the end: go to the last page that has rows.
  const stalePage = showing !== undefined && showing.items.length === 0 && showing.totalItems > 0;
  useEffect(() => {
    if (stalePage && showing) setFilters({ page: Math.ceil(showing.totalItems / PAGE_SIZE) - 1 }, { replace: true });
  }, [stalePage, showing, setFilters]);

  const subjectList = subjects.data ?? [];
  const topics = subjectList.find((s) => s.id === filters.subjectId)?.topics ?? [];
  const clear = () => {
    setFilters(EMPTY_FILTERS);
    setTyped('');
    queueMicrotask(() => heading.current?.focus());
  };
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const total = showing?.totalItems ?? 0;
  const from = total === 0 ? 0 : filters.page * PAGE_SIZE + 1;
  const to = Math.min(total, (filters.page + 1) * PAGE_SIZE);
  const atStart = filters.page === 0;
  const atEnd = to >= total;
  const go = (page: number) => setFilters({ page });

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="font-title text-title">
          {adminT('questions.title')}
        </h1>
        <Link to="/admin/questions/new" className="hit-target inline-flex min-h-target-min items-center rounded-md bg-band px-4 text-body text-on-band">
          {adminT('questions.new')}
        </Link>
      </div>
      {deleteError ? (
        <p role="alert" className="text-body font-semibold text-brick">
          <span aria-hidden="true">⚠ </span>
          {deleteError}
        </p>
      ) : null}
      <form role="search" aria-label={adminT('questions.filters')} onSubmit={(event) => event.preventDefault()} className="flex flex-wrap items-end gap-3">
        <SelectField
          label={adminT('filter.status')}
          value={filters.status}
          onChange={(status) => setFilters({ status })}
          options={STATES.map((value) => ({ value, label: adminT(`state.${value}` as 'state.DRAFT') }))}
        />
        <SelectField
          label={adminT('filter.category')}
          value={filters.category}
          onChange={(category) => setFilters({ category })}
          options={CATEGORIES.map((value) => ({ value, label: adminT(`category.${value}` as 'category.KERALA_PSC') }))}
        />
        <SelectField
          label={adminT('filter.subject')}
          value={filters.subjectId}
          onChange={(subjectId) => setFilters({ subjectId, topicId: '' })}
          options={subjectList.map((s) => ({ value: s.id, label: s.name }))}
        />
        <SelectField
          label={adminT('filter.topic')}
          value={filters.topicId}
          onChange={(topicId) => setFilters({ topicId })}
          options={topics.map((t) => ({ value: t.id, label: t.name }))}
        />
        <SelectField
          label={adminT('filter.level')}
          value={filters.examLevel}
          onChange={(examLevel) => setFilters({ examLevel })}
          options={LEVELS.map((value) => ({ value, label: adminT(`level.${value}` as 'level.TENTH') }))}
        />
        <SelectField
          label={adminT('filter.difficulty')}
          value={filters.difficulty}
          onChange={(difficulty) => setFilters({ difficulty })}
          options={DIFFICULTIES.map((value) => ({ value, label: adminT(`difficulty.${value}` as 'difficulty.EASY') }))}
        />
        <label className="flex flex-col gap-1 text-label">
          <span>{adminT('filter.search')}</span>
          <input type="search" value={typed} onChange={(event) => setTyped(event.target.value)} className={CONTROL} />
        </label>
      </form>

      {questions.isError && !questions.isPlaceholderData ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-brick bg-card p-4">
          <p>{adminT('error.load')}</p>
          <p>{questions.error instanceof AdminApiError && questions.error.detail ? questions.error.detail : adminT('error.unknown')}</p>
          <button type="button" className={BUTTON} onClick={() => void questions.refetch()}>
            {adminT('error.retry')}
          </button>
        </div>
      ) : !showing ? (
        <Skeleton rows={Array.from({ length: 8 }, () => ({ kind: 'text' as const }))} />
      ) : showing.totalItems === 0 ? (
        isFiltered(filters) ? (
          <div className="flex flex-col items-start gap-2">
            <p>{adminT('empty.filtered')}</p>
            <button type="button" className={BUTTON} onClick={clear}>
              {adminT('filter.clear')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p>{adminT('empty.bank')}</p>
            <Link to="/admin/upload" className="underline">
              {adminT('empty.upload')}
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-body">
              <caption className="pb-2 text-left text-caption text-muted">{adminT('questions.caption')}</caption>
              <thead>
                <tr className="border-b border-ink">
                  {(['col.no', 'col.question', 'col.subjectTopic', 'col.level', 'col.difficulty', 'col.state', 'col.updated', 'col.actions'] as const).map((key) => (
                    <th key={key} scope="col" className="px-2 py-2 text-label font-bold">
                      {adminT(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {showing.items.map((question) => (
                  <Row key={question.questionId} question={question} open={open.has(question.questionId)} onToggle={() => toggle(question.questionId)} onDelete={() => setDeleting(question)} />
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label={adminT('page.nav')} className="flex items-center gap-4">
            <button type="button" aria-disabled={atStart} onClick={() => (atStart ? undefined : go(filters.page - 1))} className={BUTTON}>
              {adminT('page.previous')}
            </button>
            <span>{adminT('page.range', { from: number(from), to: number(to), total: number(total) })}</span>
            <button type="button" aria-disabled={atEnd} onClick={() => (atEnd ? undefined : go(filters.page + 1))} className={BUTTON}>
              {adminT('page.next')}
            </button>
          </nav>
        </>
      )}
      {deleting ? (
        <ConfirmDialog
          title={adminT('delete.title', { no: number(deleting.displayNo) })}
          cancelLabel={adminT('delete.cancel')}
          confirmLabel={adminT('delete.confirm', { no: number(deleting.displayNo) })}
          busy={deleteBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </main>
  );
}

export type { Filters };
