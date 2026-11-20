import { apiUrl } from '../config/apiBase.ts';
import { apiFetch } from '../auth/apiFetch.ts';

export const QUESTIONS_PATH = '/api/core/v1/admin/questions';
export const SUBJECTS_PATH = '/api/core/v1/admin/subjects';

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
};

export type AdminQuestionPage = { items: AdminQuestion[]; page: number; size: number; totalItems: number };
export type AdminSubject = { id: string; name: string; topics: { id: string; name: string }[] };

/** A failed admin request; `detail` is the Problem Details text when the server sent one. */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(detail ?? `Request failed (${status})`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await apiFetch(apiUrl(path), { headers: { Accept: 'application/json, application/problem+json' } });
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    const detail = (problem as { detail?: unknown } | null)?.detail;
    throw new AdminApiError(response.status, typeof detail === 'string' ? detail : null);
  }
  return (await response.json()) as T;
}

/** `search` is a query string without the leading '?'. */
export function fetchQuestions(search: string): Promise<AdminQuestionPage> {
  return getJson<AdminQuestionPage>(`${QUESTIONS_PATH}${search ? `?${search}` : ''}`);
}

export function fetchSubjects(): Promise<AdminSubject[]> {
  return getJson<AdminSubject[]>(SUBJECTS_PATH);
}
