import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { apiUrl } from '../config/apiBase.ts';
import { deviceLanguage, type Language } from '../i18n/language.ts';
import { guestSession as appGuestSession, type GuestSession } from './guestSession.ts';
import { tokenClaim } from './jwt.ts';

/**
 * Who is using the app (AD-9, Story 2.1): a registered player or a guest.
 *
 * - On boot the client calls `POST /api/core/v1/auth/refresh` with the refresh cookie
 *   (`credentials: 'include'`) and the `X-Minnal-Auth: 1` guard, inside a Web Lock so tabs refresh one at a time
 *   (core rotates the cookie on every call). A 200 gives a 1 h access JWT that lives **in memory only**; a 401 (no
 *   or stale cookie) or any failure falls back to the Story 1.5 guest flow.
 * - A registered token is refreshed about 5 minutes before it expires. If that fails transiently the
 *   still-valid token is kept and the refresh retried; a 401 means signed out, so she becomes a guest.
 * - `getAccessToken` / `invalidate` are what the REST client and the WebSocket use: they get the
 *   registered token when there is one, the guest token otherwise.
 *
 * No token is ever written to localStorage or sessionStorage here.
 */

export const REFRESH_PATH = '/api/core/v1/auth/refresh';
/** The CSRF guard header core requires on refresh (Story 2.2), with the PWA's Origin. */
export const GUARD_HEADER = 'X-Minnal-Auth';
/** One refresh at a time across every tab of this origin, so a rotated cookie is never replayed by a sibling. */
export const REFRESH_LOCK = 'minnal-refresh';
/** A token is replaced this long before it expires. */
export const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000;
/** After a failed background refresh, try again this much later. */
export const RETRY_AFTER_FAILURE_MS = 30 * 1000;
const MAX_TIMER_MS = 2 ** 31 - 1;

export type SessionStatus = 'booting' | 'guest' | 'registered';
/** `signedOut`: the server ended her session (reuse, expiry, revocation); Home says "Please sign in again". */
export type SessionState = { status: SessionStatus; name: string | null; signedOut: boolean };

type AccessToken = { accessToken: string; expiresAt: string };
type Timer = ReturnType<typeof setTimeout>;
type GuestLike = Pick<GuestSession, 'start' | 'getAccessToken' | 'invalidate'>;

export type SessionEnv = {
  fetch?: () => typeof fetch;
  now?: () => number;
  language?: () => Language;
  setTimer?: (callback: () => void, ms: number) => Timer;
  clearTimer?: (handle: Timer) => void;
  onWake?: (callback: () => void) => () => void;
  /** Runs `task` while holding the cross-tab refresh lock (Web Locks); absent = run it directly. */
  lock?: <T>(task: () => Promise<T>) => Promise<T>;
  guest?: GuestLike;
};

function isAccessToken(value: unknown): value is AccessToken {
  if (typeof value !== 'object' || value === null) return false;
  const { accessToken, expiresAt } = value as Record<string, unknown>;
  return (
    typeof accessToken === 'string' &&
    accessToken.split('.').length === 3 &&
    typeof expiresAt === 'string' &&
    Number.isFinite(Date.parse(expiresAt))
  );
}

function browserEnv(): SessionEnv {
  if (typeof window === 'undefined') return {};
  return {
    fetch: () => window.fetch.bind(window),
    lock: (task) => (navigator.locks ? navigator.locks.request(REFRESH_LOCK, task) : task()),
    now: () => Date.now(),
    language: () => deviceLanguage(),
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

/** The result of one refresh call: a token, "no session" (401), or a transient failure. */
type RefreshOutcome = 'ok' | 'none' | 'error';
/** What the endpoint said: a token, "no session" (401), or "session ended" (401 session_ended). */
type RefreshReply = AccessToken | 'none' | 'ended';

export type Session = {
  store: UseBoundStore<StoreApi<SessionState>>;
  /** Boots the session (refresh, else guest). Idempotent. */
  start: () => void;
  /** Resolves once the boot refresh has settled. */
  ready: () => Promise<void>;
  /** Refreshes the access token now (e.g. after a profile save) so its `name` and `lang` are current. */
  refreshNow: () => Promise<boolean>;
  /** After sign-in: true when she is registered (refreshing once more if the boot said otherwise). */
  confirmSignedIn: () => Promise<boolean>;
  getAccessToken: () => Promise<string>;
  invalidate: (accessToken: string) => void;
  /** Test helper: forget everything and go back to the initial state. */
  reset: () => void;
};

export function createSession(env: SessionEnv = browserEnv()): Session {
  const now = () => env.now?.() ?? Date.now();
  const language = () => env.language?.() ?? deviceLanguage();
  const guest = env.guest ?? appGuestSession;

  // Not booted yet (tests, or before main runs): behave as a guest, so nothing waits on a refresh.
  const store = create<SessionState>(() => ({ status: 'guest', name: null, signedOut: false }));

  let token: AccessToken | null = null;
  let inflight: Promise<RefreshOutcome> | null = null;
  let timer: Timer | undefined;
  let unsubscribeWake: (() => void) | undefined;
  let booted: Promise<void> | null = null;
  /** The boot refresh failed transiently: a wake event tries again. */
  let retryOnWake = false;

  const expiresAtMs = (t: AccessToken) => Date.parse(t.expiresAt);
  const isUnexpired = (t: AccessToken | null): t is AccessToken => t !== null && now() < expiresAtMs(t);

  function clearTimer(): void {
    if (timer !== undefined) env.clearTimer?.(timer);
    timer = undefined;
  }

  function schedule(ms: number): void {
    clearTimer();
    if (!env.setTimer) return;
    const delay = Math.max(0, ms);
    timer = env.setTimer(() => {
      timer = undefined;
      if (delay > MAX_TIMER_MS) schedule(delay - MAX_TIMER_MS);
      else void refresh();
    }, Math.min(delay, MAX_TIMER_MS));
  }

  function becomeGuest(signedOut = false): void {
    token = null;
    clearTimer();
    store.setState({ status: 'guest', name: null, signedOut });
    guest.start();
  }

  async function request(): Promise<RefreshReply> {
    const fetchImpl = env.fetch?.() ?? fetch;
    const response = await fetchImpl(apiUrl(REFRESH_PATH), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', [GUARD_HEADER]: '1' },
      body: JSON.stringify({ lang: language() }),
    });
    if (response.status === 401) {
      const problem: unknown = await response.json().catch(() => null);
      return (problem as { reason?: unknown } | null)?.reason === 'session_ended' ? 'ended' : 'none';
    }
    if (!response.ok) throw new Error(`refresh failed: ${response.status}`);
    const body: unknown = await response.json();
    if (!isAccessToken(body)) throw new Error('refresh response is malformed');
    return { accessToken: body.accessToken, expiresAt: body.expiresAt };
  }

  /** One refresh call at a time (single-flight). */
  function refresh(): Promise<RefreshOutcome> {
    if (inflight) return inflight;
    inflight = (env.lock ? env.lock(request) : request())
      .then<RefreshOutcome>((next) => {
        if (next === 'none' || next === 'ended') {
          // No refresh cookie, or the server ended the session: a guest from here, told why when it ended.
          retryOnWake = false;
          becomeGuest(next === 'ended');
          return 'none';
        }
        token = next;
        retryOnWake = false;
        const rawName = tokenClaim(next.accessToken, 'name');
        store.setState({ status: 'registered', name: typeof rawName === 'string' && rawName ? rawName : null, signedOut: false });
        schedule(Math.max(expiresAtMs(next) - REFRESH_BEFORE_EXPIRY_MS - now(), RETRY_AFTER_FAILURE_MS));
        return 'ok';
      })
      .catch<RefreshOutcome>(() => {
        if (store.getState().status === 'registered' && isUnexpired(token)) {
          schedule(RETRY_AFTER_FAILURE_MS);
        } else {
          // Booting or expired with the network down: guest for now, and try again when the page wakes.
          retryOnWake = true;
          becomeGuest();
        }
        return 'error';
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  return {
    store,
    start() {
      if (booted) return;
      store.setState({ status: 'booting', name: null, signedOut: false });
      unsubscribeWake = env.onWake?.(() => {
        const { status } = store.getState();
        if (status === 'registered' && (!token || now() >= expiresAtMs(token) - REFRESH_BEFORE_EXPIRY_MS)) void refresh();
        else if (status === 'guest' && retryOnWake) void refresh();
      });
      booted = refresh().then(() => undefined);
    },
    ready() {
      return booted ?? Promise.resolve();
    },
    async refreshNow() {
      return (await refresh()) === 'ok';
    },
    async confirmSignedIn() {
      await this.ready();
      if (store.getState().status === 'registered') return true;
      return (await refresh()) === 'ok';
    },
    async getAccessToken() {
      await this.ready();
      if (store.getState().status === 'registered') {
        const usable = () => (isUnexpired(token) ? token.accessToken : null);
        const current = usable();
        if (current) return current;
        await refresh();
        const renewed = store.getState().status === 'registered' ? usable() : null;
        if (renewed) return renewed;
      }
      return guest.getAccessToken();
    },
    invalidate(accessToken) {
      if (token?.accessToken === accessToken) {
        // The server refused it: drop it, and the next use refreshes.
        token = null;
        return;
      }
      guest.invalidate(accessToken);
    },
    reset() {
      clearTimer();
      unsubscribeWake?.();
      unsubscribeWake = undefined;
      token = null;
      inflight = null;
      booted = null;
      retryOnWake = false;
      store.setState({ status: 'guest', name: null, signedOut: false });
    },
  };
}

/** The app-wide session. main.tsx starts it at boot. */
export const session = createSession();

export function startSession(): void {
  session.start();
}

export function useSession<T>(selector: (state: SessionState) => T): T {
  return session.store(selector);
}
