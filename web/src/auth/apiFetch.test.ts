import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guestTokenBody, jsonResponse } from '../test-utils/guest.ts';
import { createApiFetch } from './apiFetch.ts';
import { GUEST_TOKEN_PATH, createGuestSession } from './guestSession.ts';

function setup(apiStatuses: number[]) {
  const issued: string[] = [];
  const seen: (string | null)[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === GUEST_TOKEN_PATH) {
      const body = guestTokenBody('ml');
      issued.push(body.accessToken);
      return jsonResponse(body);
    }
    seen.push(new Headers(init?.headers).get('Authorization'));
    const status = apiStatuses.shift() ?? 200;
    return jsonResponse({ status }, status, status === 200 ? 'application/json' : 'application/problem+json');
  });
  const session = createGuestSession({
    storage: () => undefined,
    fetch: () => fetchMock as unknown as typeof fetch,
    language: () => 'ml',
    online: () => true,
  });
  return { apiFetch: createApiFetch(session, () => fetchMock as unknown as typeof fetch), issued, seen, fetchMock, session };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('apiFetch', () => {
  it('sends the guest token as a Bearer token and keeps the caller headers', async () => {
    const { apiFetch, issued, fetchMock } = setup([200]);
    const response = await apiFetch('/api/ratings/v1/x', { headers: { Accept: 'application/json' } });
    expect(response.status).toBe(200);
    const headers = new Headers(fetchMock.mock.calls[1]![1]?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${issued[0]}`);
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('on a 401: drops the token, fetches a new one and retries once', async () => {
    const { apiFetch, issued, seen } = setup([401, 200]);
    const response = await apiFetch('/api/ratings/v1/x');
    expect(response.status).toBe(200);
    expect(issued).toHaveLength(2);
    expect(seen).toEqual([`Bearer ${issued[0]}`, `Bearer ${issued[1]}`]);
  });

  it('a second 401 is surfaced to the caller (no loop)', async () => {
    const { apiFetch, issued, seen } = setup([401, 401, 200]);
    const response = await apiFetch('/api/ratings/v1/x');
    expect(response.status).toBe(401);
    expect(issued).toHaveLength(2);
    expect(seen).toHaveLength(2);
  });

  it('rejects with the session reason when no token can be had', async () => {
    const session = createGuestSession({
      storage: () => undefined,
      fetch: () => (async () => jsonResponse({}, 500)) as unknown as typeof fetch,
      language: () => 'ml',
    });
    const apiFetch = createApiFetch(session, () => vi.fn() as unknown as typeof fetch);
    await expect(apiFetch('/api/ratings/v1/x')).rejects.toMatchObject({ reason: 'server' });
  });
});
