import { session, type Session } from './session.ts';

/**
 * fetch() for the Minnal REST APIs: adds `Authorization: Bearer <access token>` (the registered player's, else the guest's). On a 401 it drops
 * that token, fetches a new one and retries once (core restarts with an ephemeral key invalidate
 * every token); a second 401 is returned to the caller. Rejects with a GuestSessionError when no
 * token can be obtained.
 */
export function createApiFetch(session: Pick<Session, 'getAccessToken' | 'invalidate'>, fetchImpl: () => typeof fetch = () => fetch) {
  const send = (input: RequestInfo | URL, init: RequestInit | undefined, token: string) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetchImpl()(input, { ...init, headers });
  };

  return async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const token = await session.getAccessToken();
    const response = await send(input, init, token);
    if (response.status !== 401) return response;
    session.invalidate(token);
    const fresh = await session.getAccessToken();
    return send(input, init, fresh);
  };
}

/** The app-wide apiFetch, bound to the app's session (registered token, else guest token). */
export const apiFetch = createApiFetch(session);
