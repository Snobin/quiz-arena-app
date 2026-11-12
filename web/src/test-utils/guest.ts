import { vi } from 'vitest';
import { GUEST_TOKEN_PATH, guestSession } from '../auth/guestSession.ts';

const base64url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** An unsigned JWT-shaped token: the client only ever reads its `lang` claim. */
export function fakeJwt(lang: string, extra: Record<string, unknown> = {}): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: 'test' }));
  const payload = base64url(JSON.stringify({ sub: crypto.randomUUID(), roles: ['GUEST'], name: 'Guest 4821', lang, ...extra }));
  return `${header}.${payload}.c2ln`;
}

export function guestTokenBody(lang: string, expiresInMs = 24 * 3600 * 1000, now = Date.now()) {
  return { accessToken: fakeJwt(lang), expiresAt: new Date(now + expiresInMs).toISOString() };
}

export function jsonResponse(body: unknown, status = 200, type = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
}

/**
 * A fetch stub: the guest endpoint answers with a fresh token in the requested language (or with
 * `guest()` when given); anything else gets a 404 Problem Details.
 */
export function stubFetch(guest?: (init: RequestInit | undefined) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith(GUEST_TOKEN_PATH)) {
      if (guest) return guest(init);
      const { lang } = JSON.parse(String(init?.body)) as { lang: string };
      return jsonResponse(guestTokenBody(lang));
    }
    return jsonResponse({ status: 404, title: 'Not Found' }, 404, 'application/problem+json');
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Fresh app-wide guest session: no stored token, started (it fetches through the stubbed fetch). */
export function restartGuestSession(): void {
  guestSession.reset();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
  guestSession.start();
}
