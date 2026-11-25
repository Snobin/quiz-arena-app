import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceLanguage, type Language } from '../i18n/language.ts';
import { fakeJwt, guestTokenBody, jsonResponse } from '../test-utils/guest.ts';
import {
  GUEST_TOKEN_PATH,
  GUEST_TOKEN_STORAGE_KEY,
  createGuestSession,
  tokenLanguage,
  type GuestSessionEnv,
} from './guestSession.ts';

const HOUR = 3600 * 1000;
const MINUTE = 60 * 1000;

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
    removeItem: vi.fn((key: string) => void data.delete(key)),
    data,
  };
}

const stored = (lang: string, expiresInMs: number) =>
  JSON.stringify({ accessToken: fakeJwt(lang), expiresAt: new Date(Date.now() + expiresInMs).toISOString() });

type Setup = {
  storage?: ReturnType<typeof memoryStorage> | null;
  language?: Language;
  respond?: (init: RequestInit | undefined) => Response | Promise<Response>;
  online?: boolean;
};

function setup({ storage = memoryStorage(), language = 'ml', respond, online = true }: Setup = {}) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (respond) return respond(init);
    const { lang } = JSON.parse(String(init?.body)) as { lang: string };
    return jsonResponse(guestTokenBody(lang));
  });
  let wake: (() => void) | undefined;
  const env: GuestSessionEnv = {
    storage: () => storage ?? undefined,
    fetch: () => fetchMock as unknown as typeof fetch,
    now: () => Date.now(),
    language: () => language,
    online: () => online,
    setTimer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (h) => clearTimeout(h),
    onWake: (cb) => {
      wake = cb;
      return () => (wake = undefined);
    },
  };
  const session = createGuestSession(env);
  return { session, fetchMock, storage, wake: () => wake?.() };
}

const flush = () => vi.advanceTimersByTimeAsync(0);
const bodies = (fetchMock: ReturnType<typeof setup>['fetchMock']) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as { lang: string });

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-12T10:00:00Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('guest session with an API base', () => {
  it('posts the guest-token request to the base origin', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(guestTokenBody('ml')));
    const session = createGuestSession({
      storage: () => undefined,
      fetch: () => fetchMock as unknown as typeof fetch,
      language: () => 'ml',
      online: () => true,
      apiBase: 'https://api.example.com',
    });
    await session.getAccessToken();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.example.com/api/core/v1/auth/guest');
  });
});

describe('guest session', () => {
  it('first boot on a Malayalam phone: one POST with lang ml, token stored, ready', async () => {
    const { session, fetchMock, storage } = setup({ language: deviceLanguage(['ml-IN']) });
    expect(session.store.getState().status).toBe('loading');
    session.start();
    session.start();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(GUEST_TOKEN_PATH);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
    expect(bodies(fetchMock)).toEqual([{ lang: 'ml' }]);
    const state = session.store.getState();
    expect(state.status).toBe('ready');
    expect(tokenLanguage(state.token!.accessToken)).toBe('ml');
    expect(JSON.parse(storage!.data.get(GUEST_TOKEN_STORAGE_KEY)!)).toEqual(state.token);
  });

  it("other device language ['ta-IN','en-GB']: lang en", async () => {
    const { session, fetchMock } = setup({ language: deviceLanguage(['ta-IN', 'en-GB']) });
    session.start();
    await flush();
    expect(bodies(fetchMock)).toEqual([{ lang: 'en' }]);
  });

  it('reuse: a stored token expiring in 2 h makes no request and is ready at once', async () => {
    const storage = memoryStorage({ [GUEST_TOKEN_STORAGE_KEY]: stored('ml', 2 * HOUR) });
    const { session, fetchMock } = setup({ storage });
    expect(session.store.getState().status).toBe('ready');
    session.start();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await session.getAccessToken()).toBe(session.store.getState().token!.accessToken);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('near expiry: a stored token expiring in 4 min is replaced', async () => {
    const storage = memoryStorage({ [GUEST_TOKEN_STORAGE_KEY]: stored('ml', 4 * MINUTE) });
    const { session, fetchMock } = setup({ storage });
    session.start();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.store.getState().status).toBe('ready');
    expect(Date.parse(session.store.getState().token!.expiresAt)).toBeGreaterThan(Date.now() + 23 * HOUR);
  });

  it('a stored token in the other language is replaced', async () => {
    const storage = memoryStorage({ [GUEST_TOKEN_STORAGE_KEY]: stored('en', 20 * HOUR) });
    const { session, fetchMock } = setup({ storage, language: 'ml' });
    session.start();
    await flush();
    expect(bodies(fetchMock)).toEqual([{ lang: 'ml' }]);
  });

  it('ignores a corrupt stored value', async () => {
    const storage = memoryStorage({ [GUEST_TOKEN_STORAGE_KEY]: '{not json' });
    const { session, fetchMock } = setup({ storage });
    session.start();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetching is single-flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { session, fetchMock, wake } = setup({
      respond: async () => {
        await gate;
        return jsonResponse(guestTokenBody('ml'));
      },
    });
    session.start();
    const a = session.getAccessToken();
    const b = session.getAccessToken();
    wake();
    release();
    const [ta, tb] = await Promise.all([a, b]);
    expect(ta).toBe(tb);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes by timer at expiresAt − 5 min, staying ready meanwhile', async () => {
    const { session, fetchMock } = setup();
    session.start();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(24 * HOUR - 5 * MINUTE - 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.store.getState().status).toBe('ready');
  });

  it('a wake signal (visibilitychange / focus) fetches when the token went stale without the timer firing', async () => {
    const storage = memoryStorage({ [GUEST_TOKEN_STORAGE_KEY]: stored('ml', 20 * HOUR) });
    const { session, fetchMock, wake } = setup({ storage });
    session.start();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 20 * HOUR - 4 * MINUTE);
    wake();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('works memory-only when storage throws', async () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      data: new Map<string, string>(),
    };
    const { session, fetchMock } = setup({ storage: broken as unknown as ReturnType<typeof memoryStorage> });
    session.start();
    await flush();
    expect(session.store.getState().status).toBe('ready');
    await session.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a 500 is an error with reason server; Retry refetches', async () => {
    let fail = true;
    const { session, fetchMock } = setup({
      respond: () => (fail ? jsonResponse({ status: 500 }, 500, 'application/problem+json') : jsonResponse(guestTokenBody('ml'))),
    });
    session.start();
    await flush();
    expect(session.store.getState()).toMatchObject({ status: 'error', reason: 'server', token: null });
    fail = false;
    await session.retry();
    expect(session.store.getState().status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a malformed body is a server error', async () => {
    const { session } = setup({ respond: () => jsonResponse({ accessToken: 42 }) });
    session.start();
    await flush();
    expect(session.store.getState()).toMatchObject({ status: 'error', reason: 'server' });
  });

  it('a network failure is an error with reason network', async () => {
    const { session } = setup({
      respond: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    session.start();
    await flush();
    expect(session.store.getState()).toMatchObject({ status: 'error', reason: 'network' });
    await expect(session.getAccessToken()).rejects.toMatchObject({ name: 'GuestSessionError', reason: 'network' });
  });

  it('offline counts as network even when the response failed', async () => {
    const { session } = setup({ online: false, respond: () => jsonResponse({}, 502) });
    session.start();
    await flush();
    expect(session.store.getState().reason).toBe('network');
  });

  it('a failed background refresh keeps the still-valid token and retries later', async () => {
    let fail = false;
    const { session, fetchMock } = setup({
      respond: () => (fail ? jsonResponse({}, 503) : jsonResponse(guestTokenBody('ml'))),
    });
    session.start();
    await flush();
    const first = session.store.getState().token;
    fail = true;
    await vi.advanceTimersByTimeAsync(24 * HOUR - 5 * MINUTE + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.store.getState()).toMatchObject({ status: 'ready', token: first });
    fail = false;
    await vi.advanceTimersByTimeAsync(31 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(session.store.getState().token).not.toEqual(first);
  });

  it('a device clock 24 h ahead never loops: at most one request per 30 s', async () => {
    const skew = 24 * HOUR;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const { lang } = JSON.parse(String(init?.body)) as { lang: string };
      // The server's clock is right; the device is a day ahead.
      return jsonResponse(guestTokenBody(lang, 24 * HOUR, Date.now()));
    });
    const session = createGuestSession({
      storage: () => undefined,
      fetch: () => fetchMock as unknown as typeof fetch,
      now: () => Date.now() + skew,
      language: () => 'ml',
      online: () => true,
      setTimer: (cb, ms) => setTimeout(cb, ms),
      clearTimer: (h) => clearTimeout(h),
    });
    session.start();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2 + 10);
    session.stop();
  });

  it('getAccessToken returns the still-valid token while a background refresh is failing', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const { session } = setup({
      respond: async () => {
        calls += 1;
        if (calls === 1) return jsonResponse(guestTokenBody('ml'));
        await gate;
        return jsonResponse({}, 503);
      },
    });
    session.start();
    await flush();
    const current = session.store.getState().token!.accessToken;
    // The refresh at expiresAt − 5 min starts and hangs, then fails.
    await vi.advanceTimersByTimeAsync(24 * HOUR - 5 * MINUTE + 1);
    expect(calls).toBe(2);
    const pending = session.getAccessToken();
    release();
    await expect(pending).resolves.toBe(current);
    await flush();
    expect(session.store.getState()).toMatchObject({ status: 'ready', token: { accessToken: current } });
  });

  it('invalidate drops only the current token', async () => {
    const { session, storage } = setup();
    session.start();
    await flush();
    const token = session.store.getState().token!;
    session.invalidate('some-other-token');
    expect(session.store.getState().token).toEqual(token);
    session.invalidate(token.accessToken);
    expect(session.store.getState()).toMatchObject({ status: 'loading', token: null });
    expect(storage!.data.has(GUEST_TOKEN_STORAGE_KEY)).toBe(false);
  });
});

describe('tokenLanguage', () => {
  it('reads the lang claim and tolerates garbage', () => {
    expect(tokenLanguage(fakeJwt('en'))).toBe('en');
    expect(tokenLanguage('a.b.c')).toBeUndefined();
    expect(tokenLanguage('')).toBeUndefined();
  });
});
