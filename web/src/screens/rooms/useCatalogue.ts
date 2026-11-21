import { useQuery } from '@tanstack/react-query';
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
