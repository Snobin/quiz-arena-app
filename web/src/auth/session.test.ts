import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, utf8Jwt } from '../test-utils/guest.ts';
import {
  GUARD_HEADER,
  LOGOUT_PATH,
  ME_PATH,
  REFRESH_LOCK,
  REFRESH_BEFORE_EXPIRY_MS,
  REFRESH_PATH,
  RETRY_AFTER_FAILURE_MS,
  createSession,
  type SessionEnv,
} from './session.ts';

const HOUR = 3600_000;
const NOW = Date.parse('2026-11-19T10:00:00Z');

type Refresh = (init: RequestInit | undefined) => Response | Promise<Response>;

function setup(...replies: Refresh[]) {
  let now = NOW;
  const timers: { callback: () => void; ms: number }[] = [];
  const wake: { fire: () => void } = { fire: () => undefined };
  const queue = [...replies];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe(REFRESH_PATH);
    return (queue.shift() ?? replies[replies.length - 1]!)(init);
  });
  const guest = { start: vi.fn(), getAccessToken: vi.fn(async () => 'guest-token'), invalidate: vi.fn() };
  const env: SessionEnv = {
    fetch: () => fetchMock as unknown as typeof fetch,
    now: () => now,
    language: () => 'en',
    setTimer: (callback, ms) => {
      timers.push({ callback, ms });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
    onWake: (callback) => {
      wake.fire = callback;
      return () => undefined;
    },
    guest,
  };
  const session = createSession(env);
  return { session, fetchMock, guest, timers, wake, advance: (ms: number) => (now += ms) };
}

const ok = (name = 'Anju', expiresInMs = HOUR): Refresh => () =>
  jsonResponse({ accessToken: utf8Jwt({ name }), expiresAt: new Date(NOW + expiresInMs).toISOString() });
const unauthorized: Refresh = () => jsonResponse({ status: 401 }, 401, 'application/problem+json');
const sessionEnded: Refresh = () => jsonResponse({ status: 401, reason: 'session_ended' }, 401, 'application/problem+json');
const networkDown: Refresh = () => Promise.reject(new TypeError('Failed to fetch'));

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('session', () => {
  it('boots by calling refresh with the cookie and keeps the token in memory only', async () => {
    const { session, fetchMock, guest } = setup(ok('അഞ്ജു'));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    session.start();
    expect(session.store.getState().status).toBe('booting');
    await session.ready();

    expect(session.store.getState()).toEqual({ status: 'registered', name: 'അഞ്ജു', signedOut: false });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)[GUARD_HEADER]).toBe('1');
    expect(JSON.parse(String(init.body))).toEqual({ lang: 'en' });
    expect(guest.start).not.toHaveBeenCalled();
    expect(await session.getAccessToken()).toMatch(/^[\w-]+\.[\w-]+\.c2ln$/);
    // The token is nowhere in web storage.
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it('falls back to the guest flow when the cookie is missing, stale or unknown (401)', async () => {
    const { session, guest } = setup(unauthorized);
    session.start();
    await session.ready();

    expect(session.store.getState()).toEqual({ status: 'guest', name: null, signedOut: false });
    expect(guest.start).toHaveBeenCalledOnce();
    expect(await session.getAccessToken()).toBe('guest-token');
  });

  it('falls back to guest when boot cannot reach the server, and tries again when the page wakes', async () => {
    const { session, guest, wake } = setup(networkDown, ok());
    session.start();
    await session.ready();
    expect(session.store.getState().status).toBe('guest');
    expect(guest.start).toHaveBeenCalledOnce();

    wake.fire();
    await vi.waitFor(() => expect(session.store.getState().status).toBe('registered'));
  });

  it('refreshes about 5 minutes before the token expires', async () => {
    const { session, fetchMock, timers } = setup(ok());
    session.start();
    await session.ready();

    expect(timers.at(-1)!.ms).toBe(HOUR - REFRESH_BEFORE_EXPIRY_MS);
    timers.at(-1)!.callback();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('keeps a still-valid token when a background refresh fails, and retries shortly', async () => {
    const { session, timers, advance, fetchMock } = setup(ok(), networkDown);
    session.start();
    await session.ready();
    advance(HOUR - REFRESH_BEFORE_EXPIRY_MS);
    timers.at(-1)!.callback();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await vi.waitFor(() => expect(timers.at(-1)!.ms).toBe(RETRY_AFTER_FAILURE_MS));
    expect(session.store.getState().status).toBe('registered');
    expect(await session.getAccessToken()).not.toBe('guest-token');
  });

  it('becomes a guest when a later refresh is refused (signed out elsewhere)', async () => {
    const { session, timers, guest } = setup(ok(), unauthorized);
    session.start();
    await session.ready();
    timers.at(-1)!.callback();

    await vi.waitFor(() => expect(session.store.getState().status).toBe('guest'));
    expect(guest.start).toHaveBeenCalledOnce();
  });

  it('a rejected registered token is dropped and replaced through refresh; others go to the guest session', async () => {
    const { session, fetchMock, guest } = setup(ok('Anju'), ok('Anju'));
    session.start();
    await session.ready();
    const first = await session.getAccessToken();

    session.invalidate('someone-elses-token');
    expect(guest.invalidate).toHaveBeenCalledWith('someone-elses-token');

    session.invalidate(first);
    await session.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(session.store.getState().status).toBe('registered');
  });

  it('refresh is single-flight', async () => {
    let release: (response: Response) => void = () => undefined;
    const gate = new Promise<Response>((resolve) => (release = resolve));
    const { session, fetchMock } = setup(() => gate);
    session.start();
    const waiting = [session.getAccessToken(), session.getAccessToken(), session.confirmSignedIn()];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(ok()(undefined) as Response);
    await Promise.all(waiting);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('confirmSignedIn refreshes once more when the boot said guest', async () => {
    const { session } = setup(unauthorized, ok());
    session.start();
    await session.ready();
    expect(await session.confirmSignedIn()).toBe(true);
    expect(session.store.getState().status).toBe('registered');
  });

  it('says "session ended" (once, as a guest) when the server ends the session, and nothing for a plain no-cookie boot', async () => {
    const ended = setup(ok(), sessionEnded);
    ended.session.start();
    await ended.session.ready();
    ended.timers.at(-1)!.callback();
    await vi.waitFor(() => expect(ended.session.store.getState()).toEqual({ status: 'guest', name: null, signedOut: true }));

    const plain = setup(unauthorized);
    plain.session.start();
    await plain.session.ready();
    expect(plain.session.store.getState().signedOut).toBe(false);

    const bootEnded = setup(sessionEnded);
    bootEnded.session.start();
    await bootEnded.session.ready();
    expect(bootEnded.session.store.getState()).toEqual({ status: 'guest', name: null, signedOut: true });
  });

  it('refreshes before handing out an expired token (a reconnect never uses a dead one)', async () => {
    const { session, fetchMock, advance } = setup(ok('Anju', HOUR), ok('Anju', 2 * HOUR));
    session.start();
    await session.ready();
    advance(HOUR + 1000);

    const token = await session.getAccessToken();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.c2ln$/);
  });
});

describe('two tabs', () => {
  /** A fake server that rotates: only the current cookie works, and replaying an old one revokes the family. */
  function cookieJar() {
    let current = 'cookie-0';
    let counter = 0;
    let revoked = false;
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchFor = async () => {
      const presented = current; // the browser's shared cookie jar at send time
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      if (revoked || presented !== current) {
        revoked = true;
        return jsonResponse({ status: 401, reason: 'session_ended' }, 401, 'application/problem+json');
      }
      counter += 1;
      current = `cookie-${counter}`;
      return jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(NOW + HOUR).toISOString() });
    };
    return { fetchFor, maxInFlight: () => maxInFlight, revoked: () => revoked };
  }

  function tab(jar: ReturnType<typeof cookieJar>, lock: SessionEnv['lock']) {
    return createSession({
      fetch: () => ((_input: RequestInfo | URL, _init?: RequestInit) => jar.fetchFor()) as unknown as typeof fetch,
      now: () => NOW,
      language: () => 'en',
      lock,
      guest: { start: vi.fn(), getAccessToken: vi.fn(async () => 'guest'), invalidate: vi.fn() },
    });
  }

  it('serialises refresh through one shared lock, so only one call is in flight and none is a replay', async () => {
    const jar = cookieJar();
    let tail: Promise<unknown> = Promise.resolve();
    const sharedLock: SessionEnv['lock'] = (task) => {
      const run = tail.then(task, task);
      tail = run.catch(() => undefined);
      return run;
    };
    const a = tab(jar, sharedLock);
    const b = tab(jar, sharedLock);
    a.start();
    b.start();
    await Promise.all([a.ready(), b.ready()]);

    expect(jar.maxInFlight()).toBe(1);
    expect(jar.revoked()).toBe(false);
    expect(a.store.getState().status).toBe('registered');
    expect(b.store.getState().status).toBe('registered');
  });

  it('without the lock the second tab replays the rotated cookie and the family is revoked (the control)', async () => {
    const jar = cookieJar();
    const a = tab(jar, undefined);
    const b = tab(jar, undefined);
    a.start();
    b.start();
    await Promise.all([a.ready(), b.ready()]);

    expect(jar.maxInFlight()).toBe(2);
    expect(jar.revoked()).toBe(true);
  });
});

describe('the browser Web Lock wiring', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes the shared minnal-refresh lock around the refresh call', async () => {
    const request = vi.fn(async (_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal('navigator', { ...navigator, locks: { request }, onLine: true, language: 'en' });
    const fetchMock = vi.fn(async () => jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + HOUR).toISOString() }));
    vi.stubGlobal('fetch', fetchMock);
    const session = createSession(); // the default browser env
    session.start();
    await session.ready();

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0]).toBe(REFRESH_LOCK);
    expect(session.store.getState().status).toBe('registered');
    session.reset();
  });

  it('still refreshes when the browser has no Web Locks', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: undefined, onLine: true, language: 'en' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ accessToken: utf8Jwt({ name: 'Anju' }), expiresAt: new Date(Date.now() + HOUR).toISOString() })));
    const session = createSession();
    session.start();
    await session.ready();
    expect(session.store.getState().status).toBe('registered');
    session.reset();
  });

  describe('signOut and deleteAccount (Story 2.8)', () => {
    function withCalls() {
      const calls: { url: string; init?: RequestInit }[] = [];
      let status = 204;
      const guest = { start: vi.fn(), getAccessToken: vi.fn(async () => 'guest-token'), invalidate: vi.fn() };
      const refresh = ok('Anju');
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        if (url === REFRESH_PATH) return refresh(init);
        return new Response(null, { status });
      });
      const session = createSession({
        fetch: () => fetchMock as unknown as typeof fetch,
        now: () => NOW,
        language: () => 'en',
        guest,
      });
      return { session, calls, guest, setStatus: (next: number) => (status = next) };
    }

    it('signOut calls logout with the cookie and guard, drops the token and starts a guest', async () => {
      const { session, calls, guest } = withCalls();
      session.start();
      await session.ready();
      guest.start.mockClear();

      await session.signOut();

      const logout = calls.find((c) => c.url === LOGOUT_PATH)!;
      expect(logout.init?.method).toBe('POST');
      expect(logout.init?.credentials).toBe('include');
      expect((logout.init?.headers as Record<string, string>)[GUARD_HEADER]).toBe('1');
      expect(session.store.getState()).toEqual({ status: 'guest', name: null, signedOut: false });
      expect(session.userId()).toBeNull();
      expect(guest.start).toHaveBeenCalled();
    });

    it('signOut still ends the session when logout cannot be reached', async () => {
      const failing = createSession({
        fetch: () => (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch,
        guest: { start: vi.fn(), getAccessToken: vi.fn(async () => 'g'), invalidate: vi.fn() },
      });
      await failing.signOut();
      expect(failing.store.getState().status).toBe('guest');
    });

    it('deleteAccount sends the bearer to DELETE /me, then signs out to a guest', async () => {
      const { session, calls } = withCalls();
      session.start();
      await session.ready();

      expect(await session.deleteAccount()).toBe(true);

      const del = calls.find((c) => c.url === ME_PATH)!;
      expect(del.init?.method).toBe('DELETE');
      expect((del.init?.headers as Record<string, string>).Authorization).toMatch(/^Bearer .+\..+\..+$/);
      expect(calls.some((c) => c.url === LOGOUT_PATH)).toBe(true);
      expect(session.store.getState().status).toBe('guest');
    });

    it('deleteAccount that the server refuses leaves her signed in', async () => {
      const { session, setStatus } = withCalls();
      session.start();
      await session.ready();
      setStatus(500);

      expect(await session.deleteAccount()).toBe(false);
      expect(session.store.getState().status).toBe('registered');
    });

    describe('DELETE 401', () => {
      function scripted(deletes: number[], refreshes: Refresh[]) {
        const deleteQueue = [...deletes];
        const refreshQueue = [...refreshes];
        const calls: string[] = [];
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          calls.push(`${init?.method ?? 'GET'} ${url}`);
          if (url === REFRESH_PATH) return (refreshQueue.shift() ?? refreshes[refreshes.length - 1]!)(init);
          if (url === ME_PATH) return new Response(null, { status: deleteQueue.shift() ?? 500 });
          return new Response(null, { status: 204 });
        });
        const session = createSession({
          fetch: () => fetchMock as unknown as typeof fetch,
          now: () => NOW,
          language: () => 'en',
          guest: { start: vi.fn(), getAccessToken: vi.fn(async () => 'g'), invalidate: vi.fn() },
        });
        return { session, calls };
      }

      it('refreshes once and retries when the token had expired', async () => {
        const { session, calls } = scripted([401, 204], [ok(), ok()]);
        session.start();
        await session.ready();
        expect(await session.deleteAccount()).toBe(true);
        expect(calls.filter((c) => c === `DELETE ${ME_PATH}`)).toHaveLength(2);
        expect(session.store.getState().status).toBe('guest');
      });

      it('returns false and keeps her signed in when the retry is refused again', async () => {
        const { session, calls } = scripted([401, 401], [ok(), ok()]);
        session.start();
        await session.ready();
        expect(await session.deleteAccount()).toBe(false);
        expect(calls.filter((c) => c === `DELETE ${ME_PATH}`)).toHaveLength(2);
        expect(session.store.getState().status).toBe('registered');
      });

      it('counts 401 as success only when the refresh shows the session is gone', async () => {
        const { session, calls } = scripted([401], [ok(), unauthorized]);
        session.start();
        await session.ready();
        expect(await session.deleteAccount()).toBe(true);
        expect(calls.filter((c) => c === `DELETE ${ME_PATH}`)).toHaveLength(1);
        expect(session.store.getState().status).toBe('guest');
      });
    });
  });
});
