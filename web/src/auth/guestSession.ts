import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { deviceLanguage, type Language } from '../i18n/language.ts';

/**
 * The guest session (AD-9, Story 1.5): a guest JWT from core-service, kept on the device and
 * reused until 5 minutes before it expires.
 *
 * - The token `{accessToken, expiresAt}` lives in localStorage (memory only when storage fails).
 * - A stored token is reused while `now < expiresAt − 5 min` and its `lang` claim matches the
 *   device language; otherwise a new one is fetched. Fetching is single-flight.
 * - A timer refreshes it at `expiresAt − 5 min`; `visibilitychange` and `focus` re-check it, since
 *   background tabs throttle timers.
 * - A failed fetch keeps its reason (offline/network vs server) for Home's inline alert.
 *
 * The token is never decoded for anything but its `lang` claim: identity is the server's business.
 */

export const GUEST_TOKEN_PATH = '/api/core/v1/auth/guest';
export const GUEST_TOKEN_STORAGE_KEY = 'minnal.guestToken';
/** A token is replaced this long before it expires. */
export const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
/** After a failed background refresh (old token still valid), try again this much later. */
export const RETRY_AFTER_FAILURE_MS = 30 * 1000;
/** setTimeout's ceiling (about 24.8 days); longer delays are re-armed. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export type GuestToken = { accessToken: string; expiresAt: string };
export type GuestSessionStatus = 'loading' | 'ready' | 'error';
export type GuestErrorReason = 'network' | 'server';

export type GuestSessionState = {
  status: GuestSessionStatus;
  token: GuestToken | null;
  reason: GuestErrorReason | null;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Timer = ReturnType<typeof setTimeout>;

export type GuestSessionEnv = {
  storage?: () => StorageLike | undefined;
  fetch?: () => typeof fetch;
  now?: () => number;
  language?: () => Language;
  online?: () => boolean;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (handle: Timer) => void;
  /** Subscribes to "the page may have woken up" signals; returns the unsubscribe. */
  onWake?: (callback: () => void) => () => void;
};

/** A failure that carries its reason, so callers (and Home) can say what went wrong. */
export class GuestSessionError extends Error {
  readonly reason: GuestErrorReason;

  constructor(reason: GuestErrorReason, message: string) {
    super(message);
    this.name = 'GuestSessionError';
    this.reason = reason;
  }
}

function isGuestToken(value: unknown): value is GuestToken {
  if (typeof value !== 'object' || value === null) return false;
  const { accessToken, expiresAt } = value as Record<string, unknown>;
  return (
    typeof accessToken === 'string' &&
    accessToken.split('.').length === 3 &&
    typeof expiresAt === 'string' &&
    Number.isFinite(Date.parse(expiresAt))
  );
}

/** The `lang` claim of a JWT, or undefined. The only claim the client ever reads. */
export function tokenLanguage(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims: unknown = JSON.parse(atob(padded));
    const lang = (claims as Record<string, unknown> | null)?.lang;
    return typeof lang === 'string' ? lang : undefined;
  } catch {
    return undefined;
  }
}

function browserEnv(): GuestSessionEnv {
  if (typeof window === 'undefined') return {};
  return {
    storage: () => window.localStorage,
    fetch: () => window.fetch.bind(window),
    now: () => Date.now(),
    language: () => deviceLanguage(),
    online: () => navigator.onLine !== false,
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle),
    onWake: (callback) => {
      const onVisibility = () => {
        if (document.visibilityState === 'visible') callback();
      };
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('focus', callback);
      window.addEventListener('online', callback);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('focus', callback);
        window.removeEventListener('online', callback);
      };
    },
  };
}

export type GuestSession = {
  store: UseBoundStore<StoreApi<GuestSessionState>>;
  /** Reads the stored token, fetches one if needed, and keeps it fresh. Idempotent. */
  start: () => void;
  /** Stops the timer and the wake listeners. */
  stop: () => void;
  /** A usable access token: the current one, or a freshly fetched one (single-flight). */
  getAccessToken: () => Promise<string>;
  /** Drops `accessToken` if it is still the current token (the server rejected it with 401). */
  invalidate: (accessToken: string) => void;
  /** Home's Retry: fetch again now. */
  retry: () => Promise<void>;
  /** Test helper: stop, forget the token (memory and storage) and go back to loading. */
  reset: () => void;
};

export function createGuestSession(env: GuestSessionEnv = browserEnv()): GuestSession {
  const now = () => env.now?.() ?? Date.now();
  const language = () => env.language?.() ?? deviceLanguage();

  function readStored(): GuestToken | null {
    try {
      const raw = env.storage?.()?.getItem(GUEST_TOKEN_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return isGuestToken(parsed) ? { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt } : null;
    } catch {
      return null;
    }
  }

  function writeStored(token: GuestToken | null): void {
    try {
      const storage = env.storage?.();
      if (token) storage?.setItem(GUEST_TOKEN_STORAGE_KEY, JSON.stringify(token));
      else storage?.removeItem(GUEST_TOKEN_STORAGE_KEY);
    } catch {
      // Storage blocked or full: the token still lives in memory for this page.
    }
  }

  const expiresAtMs = (token: GuestToken) => Date.parse(token.expiresAt);
  /** Reusable: not within 5 minutes of expiry, and in the device language. */
  const isFresh = (token: GuestToken | null): token is GuestToken =>
    token !== null &&
    now() < expiresAtMs(token) - REFRESH_BEFORE_EXPIRY_MS &&
    tokenLanguage(token.accessToken) === language();
  /** Still accepted by the servers (even if due for a refresh). */
  const isUnexpired = (token: GuestToken | null): token is GuestToken =>
    token !== null && now() < expiresAtMs(token) && tokenLanguage(token.accessToken) === language();

  const initial = readStored();
  const store = create<GuestSessionState>(() =>
    isFresh(initial) ? { status: 'ready', token: initial, reason: null } : { status: 'loading', token: null, reason: null },
  );

  let inflight: Promise<GuestToken> | null = null;
  let timer: Timer | undefined;
  let unsubscribeWake: (() => void) | undefined;
  let started = false;

  function clearTimer(): void {
    if (timer !== undefined) env.clearTimer?.(timer);
    timer = undefined;
  }

  function schedule(ms: number): void {
    clearTimer();
    if (!started || !env.setTimer) return;
    const delay = Math.max(0, ms);
    timer = env.setTimer(() => {
      timer = undefined;
      if (delay > MAX_TIMER_MS) schedule(delay - MAX_TIMER_MS);
      else void check();
    }, Math.min(delay, MAX_TIMER_MS));
  }

  // Floored at RETRY_AFTER_FAILURE_MS: with a device clock far ahead, a token just fetched is
  // already "due", and an unfloored schedule(0) would POST in a tight loop.
  function scheduleRefresh(token: GuestToken): void {
    schedule(Math.max(expiresAtMs(token) - REFRESH_BEFORE_EXPIRY_MS - now(), RETRY_AFTER_FAILURE_MS));
  }

  async function requestToken(): Promise<GuestToken> {
    const fetchImpl = env.fetch?.() ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(GUEST_TOKEN_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ lang: language() }),
      });
    } catch {
      throw new GuestSessionError('network', 'guest token request failed to reach the server');
    }
    if (!response.ok) throw new GuestSessionError('server', `guest token request failed: ${response.status}`);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GuestSessionError('server', 'guest token response is not JSON');
    }
    if (!isGuestToken(body)) throw new GuestSessionError('server', 'guest token response is malformed');
    return { accessToken: body.accessToken, expiresAt: body.expiresAt };
  }

  /** Fetches a new token (single-flight) and updates the store. */
  function refresh(): Promise<GuestToken> {
    if (inflight) return inflight;
    const current = store.getState().token;
    // A still-valid token keeps the session ready while its replacement is fetched.
    if (!isUnexpired(current)) store.setState({ status: 'loading', token: null, reason: null });
    inflight = requestToken()
      .then((token) => {
        writeStored(token);
        store.setState({ status: 'ready', token, reason: null });
        scheduleRefresh(token);
        return token;
      })
      .catch((error: unknown) => {
        // Offline always reads as a network problem, whatever the failure looked like.
        const reason: GuestErrorReason =
          env.online?.() === false ? 'network' : error instanceof GuestSessionError ? error.reason : 'server';
        const kept = store.getState().token;
        if (isUnexpired(kept)) {
          // Background refresh failed: keep the valid token and try again shortly.
          schedule(RETRY_AFTER_FAILURE_MS);
        } else {
          store.setState({ status: 'error', token: null, reason });
        }
        throw error instanceof GuestSessionError ? error : new GuestSessionError(reason, String(error));
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  /** Fetches only when the current token is not fresh. Never rejects. */
  async function check(): Promise<void> {
    const { token, status } = store.getState();
    if (isFresh(token)) {
      if (status !== 'ready') store.setState({ status: 'ready', reason: null });
      scheduleRefresh(token);
      return;
    }
    try {
      await refresh();
    } catch {
      // The store holds the reason.
    }
  }

  return {
    store,
    start() {
      if (started) return;
      started = true;
      unsubscribeWake = env.onWake?.(() => {
        // Any wake (visible, focus, back online) re-checks, from the error state too: a stale or
        // missing token is fetched again; a fresh one only re-arms the timer.
        void check();
      });
      void check();
    },
    stop() {
      started = false;
      clearTimer();
      unsubscribeWake?.();
      unsubscribeWake = undefined;
    },
    async getAccessToken() {
      const { token } = store.getState();
      // A still-valid token is used even while its replacement is being fetched (that fetch may fail).
      if (isUnexpired(token)) return token.accessToken;
      return (await refresh()).accessToken;
    },
    invalidate(accessToken) {
      const { token } = store.getState();
      if (token?.accessToken !== accessToken) return;
      writeStored(null);
      clearTimer();
      store.setState({ status: 'loading', token: null, reason: null });
    },
    async retry() {
      try {
        await refresh();
      } catch {
        // The store holds the reason.
      }
    },
    reset() {
      this.stop();
      inflight = null;
      writeStored(null);
      store.setState({ status: 'loading', token: null, reason: null });
    },
  };
}

/** The app-wide guest session. main.tsx starts it at boot. */
export const guestSession = createGuestSession();

/** Starts the app-wide guest session (idempotent). */
export function startGuestSession(): void {
  guestSession.start();
}

export function useGuestSession<T>(selector: (state: GuestSessionState) => T): T {
  return guestSession.store(selector);
}
