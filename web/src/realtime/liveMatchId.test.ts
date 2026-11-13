import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clear, LIVE_MATCH_ID_KEY, load, save } from './liveMatchId.ts';

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('liveMatchId', () => {
  it('saves, loads and clears {matchId} under minnal.liveMatchId', () => {
    expect(load()).toBeNull();
    save({ matchId: 'm-1' });
    expect(JSON.parse(window.sessionStorage.getItem(LIVE_MATCH_ID_KEY)!)).toEqual({ matchId: 'm-1' });
    expect(load()).toEqual({ matchId: 'm-1' });
    clear();
    expect(load()).toBeNull();
  });

  it.each(['not json', '{}', '{"matchId":""}', '{"matchId":7}', 'null'])('a corrupt entry (%s) reads as none and is dropped', (text) => {
    window.sessionStorage.setItem(LIVE_MATCH_ID_KEY, text);
    expect(load()).toBeNull();
    expect(window.sessionStorage.getItem(LIVE_MATCH_ID_KEY)).toBeNull();
  });

  it('storage that throws never throws to the caller', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => save({ matchId: 'm-1' })).not.toThrow();
    expect(load()).toBeNull();
    expect(() => clear()).not.toThrow();
  });
});
