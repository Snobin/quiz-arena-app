import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REDUCE_EFFECTS_STORAGE_KEY,
  createReduceEffects,
  isReducedPath,
  type ReduceEffectsEnv,
} from './reduceEffects.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    data,
  };
}

function osMedia(matches: boolean) {
  let listener: ((event: { matches: boolean }) => void) | undefined;
  return {
    query: (q: string) => {
      expect(q).toBe('(prefers-reduced-motion: reduce)');
      return { matches, addEventListener: (_: 'change', l: typeof listener) => void (listener = l) };
    },
    change: (value: boolean) => listener?.({ matches: value }),
  };
}

/** A manual rAF: `frame(t)` runs the pending callback with timestamp t. */
function manualFrames() {
  let pending: ((t: number) => void) | undefined;
  return {
    requestFrame: (cb: (t: number) => void) => {
      pending = cb;
      return 1;
    },
    cancelFrame: () => {
      pending = undefined;
    },
    frame(t: number) {
      const cb = pending;
      pending = undefined;
      cb?.(t);
    },
    get pending() {
      return pending !== undefined;
    },
  };
}

const reduced = (env: ReduceEffectsEnv) => isReducedPath(createReduceEffects(env).store.getState());

describe('Reduce effects setting', () => {
  it('defaults to follow-phone', () => {
    const { store } = createReduceEffects({ storage: () => memoryStorage() });
    expect(store.getState().setting).toBe('follow-phone');
  });

  it('matrix: follow-phone with the OS reduce preference on is reduced, live', () => {
    const media = osMedia(true);
    const { store } = createReduceEffects({ storage: () => memoryStorage(), matchMedia: media.query });
    expect(isReducedPath(store.getState())).toBe(true);
    media.change(false);
    expect(isReducedPath(store.getState())).toBe(false);
    media.change(true);
    expect(isReducedPath(store.getState())).toBe(true);
  });

  it('matrix: blocked storage falls back to the default without throwing', () => {
    const blocked = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    const { store } = createReduceEffects({ storage: blocked, matchMedia: osMedia(true).query });
    expect(store.getState().setting).toBe('follow-phone');
    expect(isReducedPath(store.getState())).toBe(true);
    expect(() => store.getState().setSetting('on')).not.toThrow();
    expect(store.getState().setting).toBe('on');

    const throwingGet = { getItem: () => { throw new Error('quota'); }, setItem: () => {} };
    expect(createReduceEffects({ storage: () => throwingGet }).store.getState().setting).toBe('follow-phone');
  });

  it('ignores an unknown stored value', () => {
    const storage = memoryStorage({ [REDUCE_EFFECTS_STORAGE_KEY]: 'sometimes' });
    expect(createReduceEffects({ storage: () => storage }).store.getState().setting).toBe('follow-phone');
  });

  it('persists the setting; on/off override the OS', () => {
    const storage = memoryStorage();
    const media = osMedia(true);
    const { store } = createReduceEffects({ storage: () => storage, matchMedia: media.query });
    store.getState().setSetting('off');
    expect(storage.data.get(REDUCE_EFFECTS_STORAGE_KEY)).toBe('off');
    expect(isReducedPath(store.getState())).toBe(false);
    store.getState().setSetting('on');
    media.change(false);
    expect(isReducedPath(store.getState())).toBe(true);
    expect(createReduceEffects({ storage: () => storage }).store.getState().setting).toBe('on');
  });
});

describe('Reduce effects auto-fallback', () => {
  it('matrix: deviceMemory = 1 forces the reduced path for the session, setting unchanged', () => {
    const storage = memoryStorage({ [REDUCE_EFFECTS_STORAGE_KEY]: 'off' });
    const { store } = createReduceEffects({ storage: () => storage, deviceMemory: () => 1 });
    expect(store.getState().fallback).toBe('low-memory');
    expect(store.getState().setting).toBe('off');
    expect(isReducedPath(store.getState())).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('matrix: a missing deviceMemory API means no fallback', () => {
    expect(reduced({ storage: () => memoryStorage(), deviceMemory: () => undefined })).toBe(false);
    expect(reduced({ storage: () => memoryStorage() })).toBe(false);
    expect(reduced({ storage: () => memoryStorage(), deviceMemory: () => 2 })).toBe(false);
  });

  it('matrix: a first band drop with 4 deltas > 50 ms forces the reduced path', () => {
    const frames = manualFrames();
    const { store, monitorBandDrop } = createReduceEffects({ storage: () => memoryStorage(), ...frames });
    monitorBandDrop();
    // Deltas: 16, 60, 70, 16, 55, 80 -> the 4th slow delta (80) trips it.
    for (const t of [0, 16, 76, 146, 162, 217]) frames.frame(t);
    expect(store.getState().fallback).toBeNull();
    frames.frame(297);
    expect(store.getState().fallback).toBe('janky-band-drop');
    expect(isReducedPath(store.getState())).toBe(true);
    expect(frames.pending).toBe(false);
  });

  it('three slow frames are tolerated, and stop() ends the measurement', () => {
    const frames = manualFrames();
    const { store, monitorBandDrop } = createReduceEffects({ storage: () => memoryStorage(), ...frames });
    const stop = monitorBandDrop();
    for (const t of [0, 60, 120, 180, 196]) frames.frame(t);
    stop();
    expect(frames.pending).toBe(false);
    expect(store.getState().fallback).toBeNull();
  });

  it('matrix: later band drops are ignored', () => {
    const frames = manualFrames();
    const { store, monitorBandDrop } = createReduceEffects({ storage: () => memoryStorage(), ...frames });
    const stop = monitorBandDrop();
    for (const t of [0, 16, 32]) frames.frame(t);
    stop();
    monitorBandDrop();
    expect(frames.pending).toBe(false);
    for (const t of [0, 100, 200, 300, 400, 500]) frames.frame(t);
    expect(store.getState().fallback).toBeNull();
  });
});

describe('Reduce effects browser wiring (no env argument)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
    delete (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  });

  it('reads window.matchMedia, navigator.deviceMemory and localStorage', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener: vi.fn() }));
    vi.stubGlobal('matchMedia', matchMedia);
    Object.defineProperty(navigator, 'deviceMemory', { value: 1, configurable: true });
    window.localStorage.setItem(REDUCE_EFFECTS_STORAGE_KEY, 'off');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');

    const state = createReduceEffects().store.getState();

    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(state.osReduced).toBe(true);
    expect(state.fallback).toBe('low-memory');
    expect(getItem).toHaveBeenCalledWith(REDUCE_EFFECTS_STORAGE_KEY);
    expect(state.setting).toBe('off');
    expect(isReducedPath(state)).toBe(true);
  });
});
