import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, utf8Jwt } from '../test-utils/guest.ts';
import { apiFetch } from './apiFetch.ts';
import { REFRESH_PATH, session } from './session.ts';

afterEach(() => {
  session.reset();
  vi.unstubAllGlobals();
});

describe('the app-wide apiFetch', () => {
  it("sends a registered player's access token, not a guest token", async () => {
    const token = utf8Jwt({ name: 'Anju' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      String(input) === REFRESH_PATH
        ? jsonResponse({ accessToken: token, expiresAt: new Date(Date.now() + 3600_000).toISOString() })
        : jsonResponse({ ok: true }),
    );
    vi.stubGlobal('fetch', fetchMock);
    session.start();

    await apiFetch('/api/ratings/v1/x');

    const call = fetchMock.mock.calls.find(([input]) => String(input) === '/api/ratings/v1/x')!;
    expect(new Headers(call[1]?.headers).get('Authorization')).toBe(`Bearer ${token}`);
  });
});
