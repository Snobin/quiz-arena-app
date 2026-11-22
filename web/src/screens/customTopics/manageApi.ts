import { apiFetch } from '../../auth/apiFetch.ts';
import { apiUrl } from '../../config/apiBase.ts';
import type { Usage } from './importApi.ts';

const PATH = '/api/core/v1/me/custom-topics';

export const TOPIC_LIST_KEY = ['customTopics'] as const;
export const topicKey = (id: string) => ['customTopic', id] as const;

export type TopicSummary = { customTopicId: string; name: string; questionCount: number; updatedAt: string };
export type TopicList = { usage: Usage; topics: TopicSummary[] };
export type TopicQuestion = { position: number; text: string; lang: 'ml' | 'en'; options: string[]; answerIndex: number; explanation: string };
export type TopicDetail = { customTopicId: string; name: string; questionCount: number; revision: number; updatedAt: string; questions: TopicQuestion[] };

/** A failed list, read or delete: `detail` is the Problem Details text when core sent one; `status` 404 means the topic is gone. */
export class ManageError extends Error {
  constructor(
    readonly reason: 'network' | 'server',
    readonly detail: string | null,
    readonly status: number | null = null,
  ) {
    super(detail ?? `custom topics request failed (${status ?? 'network'})`);
    this.name = 'ManageError';
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await apiFetch(apiUrl(path), { headers: { Accept: 'application/json' }, ...init });
  } catch {
    throw new ManageError('network', null);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new ManageError('server', typeof problem?.detail === 'string' ? problem.detail : null, response.status);
  }
  return response;
}

export async function fetchTopicList(): Promise<TopicList> {
  return (await (await send(PATH)).json()) as TopicList;
}

export async function fetchTopic(id: string): Promise<TopicDetail> {
  return (await (await send(`${PATH}/${id}`)).json()) as TopicDetail;
}

export async function deleteTopic(id: string): Promise<void> {
  await send(`${PATH}/${id}`, { method: 'DELETE' });
}
