import { create, type StoreApi, type UseBoundStore } from 'zustand';

/**
 * Reduce effects (EXPERIENCE.md › Accessibility Floor). The setting is on | off | follow-phone
 * (default follow-phone, persisted). The reduced path runs when the setting is on, or when it is
 * follow-phone and the OS asks for reduced motion (live). A session auto-fallback forces it on
 * low-memory devices and after a janky first band drop; the fallback is never persisted.
 */
export type ReduceEffectsSetting = 'on' | 'off' | 'follow-phone';

export const REDUCE_EFFECTS_SETTINGS = ['on', 'off', 'follow-phone'] as const satisfies readonly ReduceEffectsSetting[];
export const DEFAULT_REDUCE_EFFECTS: ReduceEffectsSetting = 'follow-phone';
export const REDUCE_EFFECTS_STORAGE_KEY = 'minnal.reduceEffects';

/** A rAF delta above this counts as a missed frame. */
export const JANK_FRAME_MS = 50;
/** More missed frames than this in the first band drop forces the reduced path. */
export const JANK_FRAME_LIMIT = 3;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export type FallbackReason = 'low-memory' | 'janky-band-drop';

export type ReduceEffectsState = {
  setting: ReduceEffectsSetting;
  osReduced: boolean;
  fallback: FallbackReason | null;
  setSetting: (setting: ReduceEffectsSetting) => void;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type MediaQueryLike = Pick<MediaQueryList, 'matches'> & {
  addEventListener?: (type: 'change', listener: (event: { matches: boolean }) => void) => void;
};

export type ReduceEffectsEnv = {
  storage?: () => StorageLike | undefined;
  matchMedia?: (query: string) => MediaQueryLike;
  deviceMemory?: () => number | undefined;
  requestFrame?: (callback: (timestamp: number) => void) => number;
  cancelFrame?: (handle: number) => void;
};

export function isReducedPath(state: Pick<ReduceEffectsState, 'setting' | 'osReduced' | 'fallback'>): boolean {
  return state.fallback !== null || state.setting === 'on' || (state.setting === 'follow-phone' && state.osReduced);
}

function isSetting(value: unknown): value is ReduceEffectsSetting {
  return (REDUCE_EFFECTS_SETTINGS as readonly unknown[]).includes(value);
}

/** Reads the persisted setting; blocked or broken storage, or a bad value, gives the default. */
function readSetting(storage: ReduceEffectsEnv['storage']): ReduceEffectsSetting {
  try {
    const value = storage?.()?.getItem(REDUCE_EFFECTS_STORAGE_KEY);
    return isSetting(value) ? value : DEFAULT_REDUCE_EFFECTS;
  } catch {
    return DEFAULT_REDUCE_EFFECTS;
  }
}

function browserEnv(): ReduceEffectsEnv {
  if (typeof window === 'undefined') return {};
  return {
    storage: () => window.localStorage,
    matchMedia: typeof window.matchMedia === 'function' ? (query) => window.matchMedia(query) : undefined,
    deviceMemory: () => (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    requestFrame: typeof window.requestAnimationFrame === 'function' ? (cb) => window.requestAnimationFrame(cb) : undefined,
    cancelFrame: typeof window.cancelAnimationFrame === 'function' ? (h) => window.cancelAnimationFrame(h) : undefined,
  };
}

export type ReduceEffects = {
  store: UseBoundStore<StoreApi<ReduceEffectsState>>;
  /**
   * Measures the first band drop of the session: call it when the drop starts and call the
   * returned `stop()` when it ends. More than 3 rAF deltas over 50 ms force the reduced path for
   * the session. Only the first call measures; later calls return a no-op.
   */
  monitorBandDrop: () => () => void;
};

export function createReduceEffects(env: ReduceEffectsEnv = browserEnv()): ReduceEffects {
  let media: MediaQueryLike | undefined;
  try {
    media = env.matchMedia?.(REDUCED_MOTION_QUERY);
  } catch {
    media = undefined;
  }

  let lowMemory = false;
  try {
    const memory = env.deviceMemory?.();
    lowMemory = typeof memory === 'number' && memory <= 1;
  } catch {
    lowMemory = false;
  }

  const store = create<ReduceEffectsState>((set) => ({
    setting: readSetting(env.storage),
    osReduced: media?.matches ?? false,
    fallback: lowMemory ? 'low-memory' : null,
    setSetting: (setting) => {
      set({ setting });
      try {
        env.storage?.()?.setItem(REDUCE_EFFECTS_STORAGE_KEY, setting);
      } catch {
        // Storage blocked: the choice still holds for this session.
      }
    },
  }));

  media?.addEventListener?.('change', (event) => store.setState({ osReduced: event.matches }));

  let monitored = false;
  const monitorBandDrop = (): (() => void) => {
    if (monitored || !env.requestFrame) return () => {};
    monitored = true;
    const requestFrame = env.requestFrame;
    let handle: number | undefined;
    let last: number | undefined;
    let missed = 0;
    let stopped = false;
    const stop = () => {
      stopped = true;
      if (handle !== undefined) env.cancelFrame?.(handle);
      handle = undefined;
    };
    const onFrame = (timestamp: number) => {
      if (stopped) return;
      if (last !== undefined && timestamp - last > JANK_FRAME_MS) missed += 1;
      last = timestamp;
      if (missed > JANK_FRAME_LIMIT) {
        if (store.getState().fallback === null) store.setState({ fallback: 'janky-band-drop' });
        stop();
        return;
      }
      handle = requestFrame(onFrame);
    };
    handle = requestFrame(onFrame);
    return stop;
  };

  return { store, monitorBandDrop };
}

const reduceEffects = createReduceEffects();

/** The app-wide Reduce-effects store. */
export const useReduceEffectsStore = reduceEffects.store;

/** See `ReduceEffects.monitorBandDrop`. */
export const monitorBandDrop = reduceEffects.monitorBandDrop;

/** True while the reduced path is active (setting, OS preference, or session fallback). */
export function useReducedEffects(): boolean {
  return useReduceEffectsStore(isReducedPath);
}
