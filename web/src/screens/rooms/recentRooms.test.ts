import { beforeEach, describe, expect, it } from 'vitest';
import { clearRecentRooms, loadRecentRooms, recentRoomsKey, saveRecentRoom, type RecentRoom } from './recentRooms.ts';

const entry = (topicId: string, hostedAt = '2026-11-11T10:00:00.000Z', questionCount = 10): RecentRoom => ({
  source: { type: 'BANK', topicId },
  topicName: `Topic ${topicId}`,
  subjectName: 'History',
  questionCount,
  hostedAt,
});

beforeEach(() => localStorage.clear());

describe('recent rooms', () => {
  it('keeps the newest first, at most 3', () => {
    for (const id of ['a', 'b', 'c', 'd']) saveRecentRoom('u1', entry(id));
    expect(loadRecentRooms('u1').map((r) => r.source.topicId)).toEqual(['d', 'c', 'b']);
  });

  it('replaces an entry with the same source and moves it to the front', () => {
    saveRecentRoom('u1', entry('a', '2026-11-01T10:00:00.000Z', 10));
    saveRecentRoom('u1', entry('b'));
    const list = saveRecentRoom('u1', entry('a', '2026-11-12T10:00:00.000Z', 20));
    expect(list.map((r) => r.source.topicId)).toEqual(['a', 'b']);
    expect(list[0]!.questionCount).toBe(20);
  });

  it('is scoped to the user id: another account never sees it', () => {
    saveRecentRoom('u1', entry('a'));
    expect(loadRecentRooms('u2')).toEqual([]);
    expect(loadRecentRooms('u1')).toHaveLength(1);
  });

  it('discards a broken value without an error', () => {
    localStorage.setItem(recentRoomsKey('u1'), '{not json');
    expect(loadRecentRooms('u1')).toEqual([]);
    expect(localStorage.getItem(recentRoomsKey('u1'))).toBeNull();
    localStorage.setItem(recentRoomsKey('u1'), JSON.stringify([{ source: { type: 'BANK' } }]));
    expect(loadRecentRooms('u1')).toEqual([]);
    expect(localStorage.getItem(recentRoomsKey('u1'))).toBeNull();
  });

  it('is cleared for the account that is deleted, and no other', () => {
    saveRecentRoom('u1', entry('a'));
    saveRecentRoom('u2', entry('a'));
    clearRecentRooms('u1');
    expect(loadRecentRooms('u1')).toEqual([]);
    expect(loadRecentRooms('u2')).toHaveLength(1);
  });
});
