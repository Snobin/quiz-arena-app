import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchEnded } from '../test-utils/realtime.ts';
import { clear, LAST_RESULT_KEY, load, PLAY_AGAIN_WINDOW_MS, save, saveSucceeded } from './lastResult.ts';
import { parseMatchEnded } from './protocol.ts';

const payload = () =>
  parseMatchEnded(
    matchEnded('m-1', {
      participants: [
        { participantId: 'me', displayName: 'Guest 4821', kind: 'GUEST', score: 900, correctCount: 1, placement: 1 },
        { participantId: 'bot', displayName: 'Minnal Bot', kind: 'BOT', score: 0, correctCount: 0, placement: 2 },
      ],
      breakdown: { me: [{ pickedIndex: 0, correct: true, responseMs: 2000, points: 900 }], bot: [{ correct: false, points: 0 }] },
    }).payload,
  )!;

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('lastResult', () => {
  it('saves, loads and clears {matchId, selfId, payload} under minnal.lastResult', () => {
    expect(load()).toBeNull();
    save({ matchId: 'm-1', selfId: 'me', payload: payload(), guest: false });
    expect(JSON.parse(window.sessionStorage.getItem(LAST_RESULT_KEY)!)).toMatchObject({ matchId: 'm-1', selfId: 'me' });
    expect(load()).toEqual({ matchId: 'm-1', selfId: 'me', payload: payload(), guest: false, endedAt: expect.any(Number), succeeded: null });
    save({ matchId: 'm-1', selfId: 'me', payload: payload(), guest: true });
    expect(load()?.guest).toBe(true);
    // An entry from before the flag existed is unknown (null), not silently a registered match.
    const legacy = JSON.parse(window.sessionStorage.getItem(LAST_RESULT_KEY)!) as Record<string, unknown>;
    delete legacy.guest;
    window.sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(legacy));
    expect(load()?.guest).toBeNull();
    clear();
    expect(load()).toBeNull();
  });

  it('keeps a ROOM_SUCCEEDED with its match for the 60 s window only (Story 5.6)', () => {
    const succeeded = { code: 'K7M2QX', hostDisplayName: 'Rajeev', source: { type: 'BANK' as const, topicId: 't1' }, questionCount: 10 };
    vi.useFakeTimers();
    try {
      save({ matchId: 'm-1', selfId: 'me', payload: payload(), guest: false });
      // Another match's notice is ignored.
      saveSucceeded('m-other', succeeded);
      expect(load()?.succeeded).toBeNull();
      saveSucceeded('m-1', succeeded);
      expect(load()?.succeeded).toEqual(succeeded);
      // The same MATCH_ENDED again keeps it, and keeps the first time.
      save({ matchId: 'm-1', selfId: 'me', payload: payload(), guest: false });
      expect(load()?.succeeded).toEqual(succeeded);
      vi.advanceTimersByTime(PLAY_AGAIN_WINDOW_MS - 1);
      expect(load()?.succeeded).toEqual(succeeded);
      vi.advanceTimersByTime(1);
      expect(load()?.succeeded).toBeNull();
      expect(load()?.matchId).toBe('m-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['not JSON', '{oops'],
    ['a payload that does not parse', JSON.stringify({ matchId: 'm-1', selfId: 'me', payload: { matchId: 'm-1' } })],
    ['a selfId not among the participants', JSON.stringify({ matchId: 'm-1', selfId: 'stranger', payload: payload() })],
    ['a matchId that differs from the payload', JSON.stringify({ matchId: 'm-2', selfId: 'me', payload: payload() })],
  ])('a corrupt entry (%s) reads as none and is dropped', (_, text) => {
    window.sessionStorage.setItem(LAST_RESULT_KEY, text);
    expect(load()).toBeNull();
    expect(window.sessionStorage.getItem(LAST_RESULT_KEY)).toBeNull();
  });

  it('storage that throws is survived', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => save({ matchId: 'm-1', selfId: 'me', payload: payload(), guest: false })).not.toThrow();
    expect(load()).toBeNull();
    expect(() => clear()).not.toThrow();
  });
});
