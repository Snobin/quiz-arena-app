import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../test-utils/guest.ts';
import { RETRY_WINDOW_MS, useMatchDelta } from './useMatchDelta.ts';

const MATCH = 'm-1';
let replies: Array<() => Response | Promise<Response>>;
let calls: number;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  calls = 0;
  replies = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      calls += 1;
      return (replies.shift() ?? (() => jsonResponse({ status: 404 }, 404, 'application/problem+json')))();
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

vi.mock('../auth/apiFetch.ts', () => ({ apiFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) }));

const rated = (delta: number) => () => jsonResponse({ matchId: MATCH, mode: 'QUICK', rated: true, ratingBefore: 1200, ratingAfter: 1200 + delta, delta });

describe('useMatchDelta', () => {
  it('is hidden and asks nothing when disabled (a guest, or a match known to be unrated)', () => {
    const { result } = renderHook(() => useMatchDelta(MATCH, false));
    expect(result.current).toEqual({ status: 'hidden' });
    expect(calls).toBe(0);
  });

  it('waits while the match is not processed (404), then shows the delta', async () => {
    replies = [
      () => jsonResponse({ status: 404 }, 404, 'application/problem+json'),
      () => jsonResponse({ status: 404 }, 404, 'application/problem+json'),
      rated(24),
    ];
    const { result } = renderHook(() => useMatchDelta(MATCH, true));
    expect(result.current).toEqual({ status: 'waiting' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('waiting');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current).toEqual({ status: 'ready', delta: 24, after: 1224 });
    expect(calls).toBe(3);
  });

  it('backs off 0.5 s, 1 s, then 2 s between attempts', async () => {
    renderHook(() => useMatchDelta(MATCH, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toBe(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(499)));
    expect(calls).toBe(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(calls).toBe(2);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    expect(calls).toBe(3);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1999)));
    expect(calls).toBe(3);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(calls).toBe(4);
  });

  it('says "updating" once 10 s have passed without a result, and stops asking', async () => {
    const { result } = renderHook(() => useMatchDelta(MATCH, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(RETRY_WINDOW_MS + 100)));
    expect(result.current).toEqual({ status: 'updating' });
    const settled = calls;
    await act(async () => void (await vi.advanceTimersByTimeAsync(20_000)));
    expect(calls).toBe(settled);
  });

  it('settles on unrated when the API says rated:false', async () => {
    replies = [() => jsonResponse({ matchId: MATCH, mode: 'QUICK', rated: false })];
    const { result } = renderHook(() => useMatchDelta(MATCH, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(result.current).toEqual({ status: 'unrated' });
  });

  it('treats a server error or an offline request like a 404 within the same window', async () => {
    replies = [() => Promise.reject(new TypeError('offline')), () => jsonResponse({ status: 500 }, 500, 'application/problem+json'), rated(-12)];
    const { result } = renderHook(() => useMatchDelta(MATCH, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(2000)));
    expect(result.current).toEqual({ status: 'ready', delta: -12, after: 1188 });
  });

  it('keeps asking when a rated record has no change yet, and a permanent 4xx settles on "updating" at once', async () => {
    replies = [() => jsonResponse({ matchId: MATCH, mode: 'QUICK', rated: true }), rated(8)];
    const { result } = renderHook(() => useMatchDelta(MATCH, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(600)));
    expect(result.current).toEqual({ status: 'ready', delta: 8, after: 1208 });

    replies = [() => jsonResponse({ status: 403 }, 403, 'application/problem+json')];
    const forbidden = renderHook(() => useMatchDelta(MATCH, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(forbidden.result.current).toEqual({ status: 'updating' });
  });

  it('ends the window on the clock even when a request never settles', async () => {
    replies = [() => new Promise<Response>(() => undefined) as unknown as Response];
    const { result } = renderHook(() => useMatchDelta(MATCH, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(RETRY_WINDOW_MS + 50)));
    expect(result.current).toEqual({ status: 'updating' });
  });

  it('stops asking when the screen goes away', async () => {
    const { unmount } = renderHook(() => useMatchDelta(MATCH, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    unmount();
    const before = calls;
    await act(async () => void (await vi.advanceTimersByTimeAsync(20_000)));
    expect(calls).toBe(before);
  });
});
