import { apiFetch } from '../../auth/apiFetch.ts';
import { apiUrl } from '../../config/apiBase.ts';
import type { QuestionView } from '../../realtime/protocol.ts';

/** core-service Solo Practice (Story 4.3). Registered players only. */
export const SOLO_SESSIONS_PATH = '/api/core/v1/solo/sessions';

/** Tagged source, so a custom topic can be added later without changing existing fields. */
export type PracticeSource = { type: 'BANK'; topicId: string; topicName: string; subjectName: string } | { type: 'CUSTOM'; [key: string]: unknown };

export type StartedSession = { sessionId: string; source: PracticeSource; poolSize: number };
export type NextQuestion = { position: number; source: PracticeSource; reshuffled: boolean; question: QuestionView };
export type AnswerResult = {
  correct: boolean;
  answerIndex: number;
  explanation: string;
  attribution?: string;
  answeredCount: number;
  correctCount: number;
};
export type Tally = { answeredCount: number; correctCount: number };

/**
 * `expired`: 404 (session gone). `unavailable`: 422 topic-unavailable. `conflict`: 409. `network`: no response.
 * `server`: anything else. `detail` is the Problem Details text when the server sent one.
 */
export class PracticeError extends Error {
  constructor(
    readonly kind: 'expired' | 'unavailable' | 'conflict' | 'network' | 'server',
    readonly detail: string | null,
    readonly status: number | null = null,
  ) {
    super(detail ?? `practice request failed (${status ?? 'network'})`);
    this.name = 'PracticeError';
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(apiUrl(path), {
      method: init.method ?? 'GET',
      headers: { Accept: 'application/json', ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new PracticeError('network', null);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: unknown; type?: unknown } | null;
    const detail = typeof problem?.detail === 'string' ? problem.detail : null;
    if (response.status === 404) throw new PracticeError('expired', detail, 404);
    if (response.status === 409) throw new PracticeError('conflict', detail, 409);
    if (response.status === 422 && typeof problem?.type === 'string' && problem.type.endsWith('topic-unavailable')) {
      throw new PracticeError('unavailable', detail, 422);
    }
    throw new PracticeError('server', detail, response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new PracticeError('server', null, response.status);
  }
}

const session = (id: string) => `${SOLO_SESSIONS_PATH}/${encodeURIComponent(id)}`;

export const startPractice = (topicId: string) =>
  request<StartedSession>(SOLO_SESSIONS_PATH, { method: 'POST', body: { source: { type: 'BANK', topicId } } });
export const fetchNext = (sessionId: string) => request<NextQuestion>(`${session(sessionId)}/next`);
export const sendAnswer = (sessionId: string, questionId: string, version: number, optionIndex: number) =>
  request<AnswerResult>(`${session(sessionId)}/answers`, { method: 'POST', body: { questionId, version, optionIndex } });
export const endPractice = (sessionId: string) => request<Tally>(`${session(sessionId)}/end`, { method: 'POST' });

/** The session id and last tally survive a reload in `sessionStorage` (one entry per topic). */
export type StoredPractice = { sessionId: string; answered: number; correct: number };
const storageKey = (topicId: string) => `minnal.practice.${topicId}`;

export function loadStored(topicId: string): StoredPractice | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(topicId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredPractice>;
    return typeof value.sessionId === 'string' ? { sessionId: value.sessionId, answered: Number(value.answered) || 0, correct: Number(value.correct) || 0 } : null;
  } catch {
    return null;
  }
}

export function saveStored(topicId: string, value: StoredPractice): void {
  try {
    window.sessionStorage.setItem(storageKey(topicId), JSON.stringify(value));
  } catch {
    // Storage unavailable: a reload simply starts a new session.
  }
}

export function clearStored(topicId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(topicId));
  } catch {
    // Ignored.
  }
}
