import { apiFetch } from '../../auth/apiFetch.ts';
import { apiUrl } from '../../config/apiBase.ts';
import type { Problem } from './importParse.ts';

const PATH = '/api/core/v1/me/custom-topics';

export type Usage = { topics: number; topicCap: number; questions: number; questionCap: number; warn: boolean };
export type Imported = { customTopicId: string; name: string; questionCount: number; revision: number; usage: Usage };

/** What came back from an import. `invalid` carries core's field-level problems; the others carry a note. */
export type ImportOutcome =
  | { ok: true; data: Imported }
  | { ok: false; kind: 'invalid'; problems: Problem[] }
  | { ok: false; kind: 'cap' | 'tooLarge' | 'rateLimited' | 'unavailable' | 'network' | 'server'; detail: string | null; retryAfter?: number };

type ProblemBody = { detail?: unknown; errors?: unknown };

function problemsOf(body: ProblemBody | null): Problem[] {
  if (!Array.isArray(body?.errors)) return [];
  return (body.errors as Record<string, unknown>[])
    .filter((e) => typeof e?.field === 'string' && typeof e?.problem === 'string')
    .map((e) => ({
      field: e.field as string,
      problem: e.problem as string,
      item: typeof e.item === 'number' ? e.item : undefined,
      fix: typeof e.fix === 'string' ? e.fix : undefined,
      line: typeof e.line === 'number' ? e.line : undefined,
      column: typeof e.column === 'number' ? e.column : undefined,
    }));
}

/** Sends the raw pasted text and the topic name. Never throws: a failed fetch is `network`. */
export async function importTopic(name: string, json: string): Promise<ImportOutcome> {
  let response: Response;
  try {
    response = await apiFetch(apiUrl(PATH), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, json }),
    });
  } catch {
    return { ok: false, kind: 'network', detail: null };
  }
  const body = (await response.json().catch(() => null)) as (ProblemBody & Partial<Imported>) | null;
  const detail = typeof body?.detail === 'string' ? body.detail : null;
  if (response.status === 201 && body && typeof body.customTopicId === 'string') return { ok: true, data: body as Imported };
  if (response.status === 400) {
    const problems = problemsOf(body);
    return problems.length > 0 ? { ok: false, kind: 'invalid', problems } : { ok: false, kind: 'server', detail };
  }
  if (response.status === 422) return { ok: false, kind: 'cap', detail };
  if (response.status === 413) return { ok: false, kind: 'tooLarge', detail };
  if (response.status === 429) {
    const retry = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
    return { ok: false, kind: 'rateLimited', detail, retryAfter: Number.isFinite(retry) ? retry : undefined };
  }
  if (response.status === 503) return { ok: false, kind: 'unavailable', detail };
  return { ok: false, kind: 'server', detail };
}

/** The player's usage and the caps; null when it cannot be read (the screen then leaves the cap checks to the server). */
export async function fetchUsage(): Promise<Usage | null> {
  try {
    const response = await apiFetch(apiUrl(`${PATH}/usage`));
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<Usage>;
    return typeof body.topics === 'number' && typeof body.questions === 'number' && typeof body.topicCap === 'number' && typeof body.questionCap === 'number'
      ? (body as Usage)
      : null;
  } catch {
    return null;
  }
}
