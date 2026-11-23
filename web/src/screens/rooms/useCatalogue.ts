import { useQuery } from '@tanstack/react-query';
import { fetchTopicList, TOPIC_LIST_KEY, type TopicSummary } from '../customTopics/manageApi.ts';
import { MIN_QUESTIONS } from './roomConfig.ts';
import { fetchTopics, type Catalogue, type SubjectItem, type TopicItem } from '../topics/topicsApi.ts';

/** The same query the topic picker uses (`['topics']`), so the picker's result is already here when she comes back. */
export const CATALOGUE_QUERY_KEY = ['topics'] as const;
const STALE_MS = 5 * 60 * 1000;

export function useCatalogue() {
  return useQuery({ queryKey: CATALOGUE_QUERY_KEY, queryFn: fetchTopics, staleTime: STALE_MS, retry: false });
}

export type FoundTopic = { topic: TopicItem; subject: SubjectItem };

/** A topic by id in the catalogue (published, 10 questions or more), or null when it is not listed. */
export function findTopic(catalogue: Catalogue | undefined, topicId: string | null | undefined): FoundTopic | null {
  if (!catalogue || !topicId) return null;
  for (const subject of catalogue.subjects) {
    const topic = subject.topics.find((t) => t.topicId === topicId);
    if (topic) return { topic, subject };
  }
  return null;
}

/** A custom topic needs at least `MIN_QUESTIONS` (the room's own minimum, FR76) to be a room's source. */

/**
 * The host's own custom topics (Story 6.5b), loaded only when `enabled` (a custom source is in play, so a bank room or a
 * non-host never asks). The same query as My topics, so a screen she came from has already filled it.
 */
export function useCustomTopics(enabled: boolean) {
  return useQuery({ queryKey: TOPIC_LIST_KEY, queryFn: fetchTopicList, staleTime: STALE_MS, retry: false, enabled });
}

/** A custom topic by id that a room can use (5 or more questions), or null. */
export function findCustomTopic(topics: readonly TopicSummary[] | undefined, id: string | null | undefined): TopicSummary | null {
  if (!topics || !id) return null;
  const found = topics.find((topic) => topic.customTopicId === id);
  return found && found.questionCount >= MIN_QUESTIONS ? found : null;
}
