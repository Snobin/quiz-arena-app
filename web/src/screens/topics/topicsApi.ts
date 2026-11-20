import { apiFetch } from '../../auth/apiFetch.ts';
import { apiUrl } from '../../config/apiBase.ts';

/** core-service topic catalogue and recent topics (Story 4.1). Registered players only. */
export const TOPICS_PATH = '/api/core/v1/topics?category=KERALA_PSC';
export const RECENT_TOPICS_PATH = '/api/core/v1/me/recent-topics';

export type TopicItem = { topicId: string; name: string; publishedCount: number };
export type SubjectItem = { subjectId: string; name: string; topics: TopicItem[] };
export type Catalogue = { category: string; minQuestions: number; subjects: SubjectItem[] };
export type RecentTopic = { topicId: string; subjectId: string; name: string; publishedCount: number };

/** A topic the player picked. */
export type PickedTopic = { topicId: string; name: string; subjectId: string; subjectName: string; publishedCount: number };

/** A failed request: `detail` is the Problem Details text when the server sent one. */
export class TopicsError extends Error {
  constructor(
    readonly reason: 'network' | 'server',
    readonly detail: string | null,
    readonly status: number | null = null,
  ) {
    super(detail ?? `topics request failed (${status ?? 'network'})`);
    this.name = 'TopicsError';
  }
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(apiUrl(path), { headers: { Accept: 'application/json' } });
  } catch {
    throw new TopicsError('network', null);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new TopicsError('server', typeof problem?.detail === 'string' ? problem.detail : null, response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new TopicsError('server', null, response.status);
  }
}

export const fetchTopics = () => getJson<Catalogue>(TOPICS_PATH);
export const fetchRecentTopics = () => getJson<RecentTopic[]>(RECENT_TOPICS_PATH);

/** Fire and forget: records the use; a failure is ignored. */
export function markTopicUsed(topicId: string): Promise<void> {
  return apiFetch(apiUrl(`${RECENT_TOPICS_PATH}/${encodeURIComponent(topicId)}`), { method: 'PUT' }).then(
    () => undefined,
    () => undefined,
  );
}
