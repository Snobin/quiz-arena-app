/**
 * Recently hosted rooms (Story 5.2): kept in `localStorage` under a key scoped to the player's user id, newest first, at
 * most 3, one per source. Per device by design: rooms live only in game-service memory. A broken value is discarded.
 */

export const MAX_RECENT = 3;

export type RecentRoom = {
  /** A bank topic, or one of her own custom topics (Story 6.5b). */
  source: { type: 'BANK'; topicId: string } | { type: 'CUSTOM'; customTopicId: string };
  topicName: string;
  /** The bank subject; empty for a custom topic. */
  subjectName: string;
  questionCount: number;
  /** ISO-8601 UTC. */
  hostedAt: string;
};

export const recentRoomsKey = (userId: string) => `minnal.recentRooms.${userId}`;

function isRecent(value: unknown): value is RecentRoom {
  if (typeof value !== 'object' || value === null) return false;
  const { source, topicName, subjectName, questionCount, hostedAt } = value as Record<string, unknown>;
  if (typeof source !== 'object' || source === null) return false;
  const { type, topicId, customTopicId } = source as Record<string, unknown>;
  const id = type === 'BANK' ? topicId : type === 'CUSTOM' ? customTopicId : undefined;
  return (
    typeof id === 'string' &&
    id !== '' &&
    typeof topicName === 'string' &&
    typeof subjectName === 'string' &&
    typeof questionCount === 'number' &&
    Number.isInteger(questionCount) &&
    typeof hostedAt === 'string' &&
    Number.isFinite(Date.parse(hostedAt))
  );
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The id that makes a source unique: the bank topic's or the custom topic's. */
export const sourceId = (source: RecentRoom['source']): string => (source.type === 'BANK' ? source.topicId : source.customTopicId);

/** Her recent rooms, newest first. An unreadable or malformed stored value is removed and reads as empty. */
export function loadRecentRooms(userId: string): RecentRoom[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(recentRoomsKey(userId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isRecent)) throw new Error('bad value');
    return parsed.slice(0, MAX_RECENT);
  } catch {
    try {
      store.removeItem(recentRoomsKey(userId));
    } catch {
      // Storage is unavailable: nothing to discard.
    }
    return [];
  }
}

/** Puts `entry` first, replacing any entry with the same source, and keeps the newest 3. Returns the new list. */
export function saveRecentRoom(userId: string, entry: RecentRoom): RecentRoom[] {
  const next = [entry, ...loadRecentRooms(userId).filter((r) => sourceId(r.source) !== sourceId(entry.source))].slice(0, MAX_RECENT);
  try {
    storage()?.setItem(recentRoomsKey(userId), JSON.stringify(next));
  } catch {
    // A full or blocked store: the room is still created, the list just does not remember it.
  }
  return next;
}

/** Account deletion: nothing of hers stays on the device. */
export function clearRecentRooms(userId: string): void {
  try {
    storage()?.removeItem(recentRoomsKey(userId));
  } catch {
    // Nothing to clear.
  }
}
