import i18n from '../../i18n/index.ts';
import { announce } from '../../shell/announce.ts';
import { navigate } from '../../shell/router.ts';
import type { PickedTopic } from '../topics/topicsApi.ts';
import { clampCount, countLimits, DEFAULT_QUESTIONS } from './roomConfig.ts';
import './roomCatalogue.ts';
import { formatCode } from './roomCode.ts';
import { roomClient, useRoom } from './roomClient.ts';

/** The Create screen, with a topic (and count) already chosen. */
export function createPath(topicId?: string, count?: number | null): string {
  const params = new URLSearchParams();
  if (topicId) params.set('topicId', topicId);
  if (count) params.set('count', String(count));
  const query = params.toString();
  return query ? `/rooms/create?${query}` : '/rooms/create';
}

/** The topic picker for a room: from Create (with its count), or from the host's lobby (`roomId`). */
export function pickerPath(options: { roomId?: string; count?: number } = {}): string {
  const params = new URLSearchParams({ for: 'room' });
  if (options.roomId) params.set('roomId', options.roomId);
  if (options.count) params.set('count', String(options.count));
  return `/play/topics?${params.toString()}`;
}

/**
 * Where a topic picked for a room goes: back to Create with the topic set, or (with `roomId`) into the host's
 * configure, lowering the count to what the new topic can supply, and back to the lobby.
 */
export function returnPickedTopic(topic: PickedTopic, target: { roomId: string | null; count: number | null }): void {
  if (target.roomId === null) {
    navigate(createPath(topic.topicId, target.count), { replace: true });
    return;
  }
  const { session } = useRoom.getState();
  if (!session || session.roomId !== target.roomId) {
    navigate('/rooms', { replace: true });
    return;
  }
  const limits = countLimits(topic.publishedCount);
  const current = session.room.questionCount || DEFAULT_QUESTIONS;
  const next = clampCount(current, limits);
  if (topic.topicId !== session.room.source.topicId || next !== current) {
    roomClient().configure({ source: { type: 'BANK', topicId: topic.topicId }, questionCount: next });
  }
  if (next < current) announce(i18n.t('rooms.count.lowered', { count: next }));
  navigate(`/r/${formatCode(session.code)}`, { replace: true });
}
