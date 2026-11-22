import { apiUrl } from '../config/apiBase.ts';
import { apiFetch } from '../auth/apiFetch.ts';

export const QUESTIONS_PATH = '/api/core/v1/admin/questions';
export const SUBJECTS_PATH = '/api/core/v1/admin/subjects';
export const UPLOADS_PATH = '/api/core/v1/admin/uploads';
export const DRAFTS_PATH = '/api/core/v1/admin/drafts';

export type QuestionState = 'PUBLISHED' | 'DRAFT' | 'DISCARDED' | 'DELETED';

export type AdminQuestion = {
  questionId: string;
  displayNo: number;
  currentVersion: number;
  state: QuestionState;
  hasPendingDraft: boolean;
  pendingDraftVersion: number | null;
  textMl: string | null;
  textEn: string | null;
  category: string;
  subject: string;
  topic: string;
  subjectId: string;
  topicId: string;
  examLevel: string;
  difficulty: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  updatedAt: string;
  /** The shown version's publish and discard actors ('seed' for a seeded publish); null when they do not apply. */
  publishedBy: string | null;
  publishedAt: string | null;
  discardedBy: string | null;
  discardedAt: string | null;
};

export type AdminQuestionPage = { items: AdminQuestion[]; page: number; size: number; totalItems: number };
export type AdminSubject = { id: string; name: string; topics: { id: string; name: string }[] };

/** One field-level problem from a 400 Problem Details `errors[]`. */
export type FieldProblem = { field: string; problem: string; fix?: string };

/** A failed admin request; `detail` is the Problem Details text when the server sent one. */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
    readonly errors: FieldProblem[] = [],
    /** The existing id a 409 on a subject or topic name reports. */
    readonly existingId: string | null = null,
    /** Seconds from a 429's Retry-After header. */
    readonly retryAfterSeconds: number | null = null,
    /** Stable machine reason on a 409: `deleted` or `stale`. Branch on this, never on `detail` text. */
    readonly reason: string | null = null,
  ) {
    super(detail ?? `Request failed (${status})`);
  }
}

function retryAfter(response: Response): number | null {
  const seconds = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function failure(response: Response): Promise<AdminApiError> {
  const problem = (await response.json().catch(() => null)) as { detail?: unknown; errors?: unknown; id?: unknown; reason?: unknown } | null;
  const errors = Array.isArray(problem?.errors)
    ? (problem.errors as FieldProblem[]).filter((e) => typeof e?.field === 'string' && typeof e?.problem === 'string')
    : [];
  return new AdminApiError(
    response.status,
    typeof problem?.detail === 'string' ? problem.detail : null,
    errors,
    typeof problem?.id === 'string' ? problem.id : null,
    retryAfter(response),
    typeof problem?.reason === 'string' ? problem.reason : null,
  );
}

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(apiUrl(path), { headers: { Accept: 'application/json, application/problem+json' } });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

async function send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(apiUrl(path), {
    method,
    headers: { Accept: 'application/json, application/problem+json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** What the editor sends: ids and enum names as chosen, text as typed (the server normalises). */
export type QuestionPayload = {
  category: string;
  subjectId: string;
  topicId: string;
  examLevel: string;
  difficulty: string;
  textMl: string;
  textEn: string;
  options: string[];
  answerIndex: number | null;
  explanation: string;
  attribution: string;
  sourceRef: string;
  /** Only when saving an open draft. */
  rowVersion?: number;
};

export type SavedQuestion = { questionId: string; displayNo: number; version: number; status: 'DRAFT'; rowVersion: number };

export type EditorContent = {
  category: string;
  subjectId: string;
  topicId: string;
  subject: string;
  topic: string;
  examLevel: string;
  difficulty: string;
  textMl: string | null;
  textEn: string | null;
  options: string[];
  answerIndex: number;
  explanation: string;
  attribution: string | null;
};

export type QuestionDetail = {
  questionId: string;
  displayNo: number;
  sourceRef: string | null;
  deleted: boolean;
  deletedAt: string | null;
  /** The version the form opens on: the open draft, else the latest published, else the latest. */
  editing: { version: number; status: 'DRAFT' | 'PUBLISHED' | 'DISCARDED'; rowVersion: number; content: EditorContent };
  versions: {
    version: number;
    status: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string | null;
    publishedBy: string | null;
    publishedAt: string | null;
    discardedBy: string | null;
    discardedAt: string | null;
  }[];
};

/** `search` is a query string without the leading '?'. */
export function fetchQuestions(search: string): Promise<AdminQuestionPage> {
  return getJson<AdminQuestionPage>(`${QUESTIONS_PATH}${search ? `?${search}` : ''}`);
}

export function fetchSubjects(): Promise<AdminSubject[]> {
  return getJson<AdminSubject[]>(SUBJECTS_PATH);
}

export function fetchQuestion(questionId: string): Promise<QuestionDetail> {
  return getJson<QuestionDetail>(`${QUESTIONS_PATH}/${encodeURIComponent(questionId)}`);
}

export function createQuestion(payload: QuestionPayload): Promise<SavedQuestion> {
  return send<SavedQuestion>('POST', QUESTIONS_PATH, payload);
}

/** Updates the open draft in place (with its `rowVersion`), or starts the next version as a draft. */
export function saveDraft(questionId: string, payload: QuestionPayload): Promise<SavedQuestion> {
  return send<SavedQuestion>('PUT', `${QUESTIONS_PATH}/${encodeURIComponent(questionId)}/draft`, payload);
}

export function deleteQuestion(questionId: string): Promise<void> {
  return send<void>('DELETE', `${QUESTIONS_PATH}/${encodeURIComponent(questionId)}`);
}

export function restoreQuestion(questionId: string): Promise<void> {
  return send<void>('POST', `${QUESTIONS_PATH}/${encodeURIComponent(questionId)}/restore`);
}

/** Resolves with the new id; a 409 rejects with the existing id in `existingId`. */
export async function createSubject(name: string): Promise<string> {
  return (await send<{ id: string }>('POST', SUBJECTS_PATH, { name })).id;
}

export async function createTopic(subjectId: string, name: string): Promise<string> {
  return (await send<{ id: string }>('POST', `${SUBJECTS_PATH}/${encodeURIComponent(subjectId)}/topics`, { name })).id;
}

export type UploadResult = {
  importedCount: number;
  errorCount: number;
  imported: { row: number; questionId: string; displayNo: number }[];
  createdSubjects: string[];
  createdTopics: string[];
  errors: { row: number; field: string; problem: string; fix?: string }[];
};

/** Sends the CSV as multipart `file`; the browser sets the Content-Type with its boundary. */
export async function uploadCsv(file: File): Promise<UploadResult> {
  const body = new FormData();
  body.append('file', file);
  const response = await apiFetch(apiUrl(UPLOADS_PATH), { method: 'POST', headers: { Accept: 'application/json, application/problem+json' }, body });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as UploadResult;
}

/** One open draft in the review queue. `replacesVersion` is null for a new question; `changedFields` is then empty. */
export type AdminDraft = {
  questionId: string;
  displayNo: number;
  version: number;
  rowVersion: number;
  content: EditorContent;
  createdBy: string;
  createdAt: string;
  replacesVersion: number | null;
  changedFields: string[];
};

export type AdminDraftPage = { items: AdminDraft[]; page: number; size: number; totalItems: number };

export function fetchDrafts(): Promise<AdminDraftPage> {
  return getJson<AdminDraftPage>(`${DRAFTS_PATH}?page=0&size=100`);
}

export type DraftRef = { questionId: string; version: number };

/** One item of a bulk answer: `ok`, or the HTTP `problemStatus` with the `detail` (and field `errors`). */
export type DraftActionResult = {
  questionId: string | null;
  version: number | null;
  ok: boolean;
  status?: string;
  problemStatus?: number;
  detail?: string;
  errors?: FieldProblem[];
};

export type DraftAction = 'publish' | 'discard';

const versionPath = (action: DraftAction, ref: DraftRef) =>
  `${QUESTIONS_PATH}/${encodeURIComponent(ref.questionId)}/versions/${ref.version}/${action}`;

/** The request a commit makes: one draft (the single endpoint) or several (the bulk endpoint, up to 100). */
export function commitRequest(action: DraftAction, refs: DraftRef[], bulk: boolean): { path: string; body: unknown } {
  const first = refs[0] as DraftRef;
  return bulk ? { path: `${DRAFTS_PATH}/${action}`, body: bulkBody(refs) } : { path: versionPath(action, first), body: undefined };
}

const bulkBody = (refs: DraftRef[]) => ({ items: refs.map(({ questionId, version }) => ({ questionId, version })) });

/** Publishes or discards one draft. Rejects with an AdminApiError (409, 400 with field errors, ...). */
export async function commitSingle(action: DraftAction, ref: DraftRef): Promise<void> {
  await send<DraftActionResult>('POST', versionPath(action, ref));
}

/** Applies each item independently; resolves with one result per item, in order. */
export async function commitBulk(action: DraftAction, refs: DraftRef[]): Promise<DraftActionResult[]> {
  return (await send<{ results: DraftActionResult[] }>('POST', `${DRAFTS_PATH}/${action}`, bulkBody(refs))).results;
}

export const REPORTS_PATH = '/api/core/v1/admin/reports';

export type ReportStatus = 'OPEN' | 'RESOLVED_FIXED' | 'DISMISSED';
export type ReportSurface = 'LIVE_REVEAL' | 'RESULTS' | 'SOLO';

export type AdminReport = {
  reportId: string;
  note: string | null;
  reporterName: string;
  surface: ReportSurface;
  createdAt: string;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  fixedByVersion: number | null;
};

/** The reports on one `{questionId, version}`. */
export type AdminReportGroup = {
  questionId: string;
  displayNo: number;
  version: number;
  textMl: string | null;
  textEn: string | null;
  currentPublishedVersion: number | null;
  pendingDraftVersion: number | null;
  reportCount: number;
  firstReportedAt: string;
  lastReportedAt: string;
  reports: AdminReport[];
};

export type AdminReportPage = { items: AdminReportGroup[]; page: number; size: number; totalItems: number };

export function fetchReportSummary(): Promise<{ openCount: number }> {
  return getJson<{ openCount: number }>(`${REPORTS_PATH}/summary`);
}

/** One page of report groups; `questionId` narrows the list to one question (the editor banner). */
export function fetchReports(status: 'OPEN' | 'CLOSED', questionId?: string): Promise<AdminReportPage> {
  const params = new URLSearchParams({ status, page: '0', size: '100' });
  if (questionId) params.set('questionId', questionId);
  return getJson<AdminReportPage>(`${REPORTS_PATH}?${params.toString()}`);
}

export type DismissRequest = { questionId: string; version: number; note: string };

/** The request a dismiss makes, precomputed so a tab close can send it with `keepalive`. */
export function dismissRequest(body: DismissRequest): { path: string; body: DismissRequest } {
  return { path: `${REPORTS_PATH}/dismiss`, body };
}

/** Dismisses every open report on one version. Rejects with an AdminApiError (400 field error, 409 none open). */
export async function dismissReports(body: DismissRequest): Promise<void> {
  await send<{ ok: true }>('POST', `${REPORTS_PATH}/dismiss`, body);
}
