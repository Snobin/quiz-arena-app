import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL,
  FakeStomp,
  JOIN,
  MATCHMAKING_CANCELLED,
  MATCHMAKING_FAILED,
  SERVER_TIME,
  matchFound,
  serverError,
} from '../test-utils/realtime.ts';
import { createRealtime, sameOriginUrl, type Realtime, type RealtimeEnv } from './connection.ts';
import { INITIAL_LIVE_GAME, liveGameStore } from './liveGameStore.ts';
import { USER_PRIVATE_QUEUE } from './protocol.ts';

let clients: FakeStomp[];
let tokens: string[];
let env: RealtimeEnv;
let realtime: Realtime;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const state = () => liveGameStore.getState();
const last = () => clients[clients.length - 1]!;

beforeEach(() => {
  clients = [];
  tokens = ['token-1', 'token-2', 'token-3'];
  env = {
    factory: (config) => {
      const client = new FakeStomp(config);
      clients.push(client);
      return client;
    },
    getAccessToken: vi.fn(async () => tokens[0]!),
    invalidate: vi.fn((token: string) => {
      if (tokens[0] === token) tokens.shift();
    }),
    url: () => 'wss://minnal.example/ws',
    now: () => Date.parse(SERVER_TIME) - 1500,
  };
  realtime = createRealtime(env);
});

afterEach(() => {
  realtime.reset();
  liveGameStore.setState(INITIAL_LIVE_GAME, true);
});

async function joinAndOpen() {
  realtime.joinQuickMatch();
  await flush();
  last().open();
}

describe('the connection', () => {
  it('connects lazily on the first join, with the bearer token, no auto-reconnect and 10 s heartbeats', async () => {
    expect(clients).toHaveLength(0);
    realtime.joinQuickMatch();
    expect(state().phase).toBe('searching');
    await flush();
    expect(clients).toHaveLength(1);
    const client = last();
    expect(client.activations).toBe(1);
    expect(client.config.brokerURL).toBe('wss://minnal.example/ws');
    expect(client.authorization).toBe('Bearer token-1');
    expect(client.config.reconnectDelay).toBe(0);
    expect(client.config.heartbeatIncoming).toBe(10_000);
    expect(client.config.heartbeatOutgoing).toBe(10_000);
    // The join waits for the socket, then goes after the subscription.
    expect(client.published).toEqual([]);
    client.open();
    expect(client.published).toEqual([{ destination: JOIN, body: '{}' }]);
  });

  it('keeps one client open across joins', async () => {
    await joinAndOpen();
    last().deliver(MATCHMAKING_FAILED);
    realtime.joinQuickMatch();
    await flush();
    expect(clients).toHaveLength(1);
    expect(last().sentTo(JOIN)).toBe(2);
  });

  it('a refused CONNECT invalidates the token and retries once with a new one', async () => {
    realtime.joinQuickMatch();
    await flush();
    clients[0]!.refuse();
    expect(env.invalidate).toHaveBeenCalledWith('token-1');
    await flush();
    expect(clients).toHaveLength(2);
    expect(clients[1]!.authorization).toBe('Bearer token-2');
    clients[1]!.open();
    expect(clients[1]!.published).toEqual([{ destination: JOIN, body: '{}' }]);
    expect(state().phase).toBe('searching');
  });

  it('a second refusal is a connection failure (no third attempt)', async () => {
    realtime.joinQuickMatch();
    await flush();
    clients[0]!.refuse();
    await flush();
    clients[1]!.refuse();
    await flush();
    expect(clients).toHaveLength(2);
    expect(state()).toMatchObject({ phase: 'failed', problem: { kind: 'connection' } });
  });

  it('a socket that never opens, or a token that cannot be had, is a connection failure', async () => {
    realtime.joinQuickMatch();
    await flush();
    last().drop();
    expect(state()).toMatchObject({ phase: 'failed', problem: { kind: 'connection' } });

    env.getAccessToken = vi.fn(async () => {
      throw new Error('offline');
    });
    realtime = createRealtime(env);
    realtime.joinQuickMatch();
    await flush();
    expect(state()).toMatchObject({ phase: 'failed', problem: { kind: 'connection' } });
  });

  it('dropping while searching fails; the next join opens a new socket', async () => {
    await joinAndOpen();
    last().drop();
    expect(state()).toMatchObject({ phase: 'failed', problem: { kind: 'connection' } });
    realtime.joinQuickMatch();
    await flush();
    expect(clients).toHaveLength(2);
  });
});

describe('messages → store', () => {
  it('subscribes to the private queue and stores MATCH_FOUND with the clock offset', async () => {
    await joinAndOpen();
    const found = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    last().deliver(found);
    expect(state().phase).toBe('found');
    expect(state().match).toEqual(found.payload);
    expect(state().clockOffsetMs).toBe(1500);
    expect(USER_PRIVATE_QUEUE).toBe('/user/queue/game');
  });

  it('MATCHMAKING_FAILED, SERVER_DRAINING, ALREADY_IN_MATCH and other refusals', async () => {
    await joinAndOpen();
    last().deliver(MATCHMAKING_FAILED);
    expect(state()).toMatchObject({ phase: 'failed', problem: { kind: 'matchmaking' } });
    last().deliver(serverError('SERVER_DRAINING'));
    expect(state().problem).toEqual({ kind: 'draining' });
    last().deliver(serverError('ALREADY_IN_MATCH', 'm-1'));
    expect(state().problem).toEqual({ kind: 'alreadyInMatch', matchId: 'm-1' });
    last().deliver(serverError('ALREADY_IN_MATCH'));
    expect(state().problem).toEqual({ kind: 'alreadyInMatch' });
    last().deliver(serverError('FORBIDDEN_MODE'));
    expect(state().problem).toEqual({ kind: 'rejected', code: 'FORBIDDEN_MODE' });
  });

  it('ignores malformed and unknown messages', async () => {
    await joinAndOpen();
    last().deliver('not json');
    last().deliver({ type: 'MATCH_FOUND', serverTime: SERVER_TIME, payload: { nope: true } });
    last().deliver({ type: 'TELEPORT', serverTime: SERVER_TIME });
    expect(state().phase).toBe('searching');
  });
});

describe('cancel', () => {
  it('when open: sends cancel, then MATCHMAKING_CANCELLED ends it', async () => {
    await joinAndOpen();
    expect(realtime.cancelMatchmaking()).toBe('sent');
    expect(last().sentTo(CANCEL)).toBe(1);
    expect(state().phase).toBe('cancelling');
    last().deliver(MATCHMAKING_CANCELLED);
    expect(state().phase).toBe('cancelled');
    // The socket stays open.
    expect(last().deactivations).toBe(0);
  });

  it('a late MATCHMAKING_CANCELLED does not end a search started since', async () => {
    await joinAndOpen();
    realtime.cancelMatchmaking();
    realtime.joinQuickMatch(); // a new visit joins before the old cancel's ack arrives
    expect(state().phase).toBe('searching');
    last().deliver(MATCHMAKING_CANCELLED);
    expect(state().phase).toBe('searching');
    expect(state().clockOffsetMs).toBe(1500);
  });

  it('CANCEL_REJECTED keeps searching and MATCH_FOUND follows', async () => {
    await joinAndOpen();
    realtime.cancelMatchmaking();
    last().deliver(serverError('CANCEL_REJECTED'));
    expect(state().phase).toBe('searching');
    last().deliver(matchFound({ name: 'Vishnu', kind: 'GUEST' }));
    expect(state().phase).toBe('found');
  });

  it('NOT_IN_QUEUE after a cancel counts as cancelled', async () => {
    await joinAndOpen();
    realtime.cancelMatchmaking();
    last().deliver(serverError('NOT_IN_QUEUE'));
    expect(state().phase).toBe('cancelled');
  });

  it('before the socket opens: closes the attempt and nothing is sent', async () => {
    realtime.joinQuickMatch();
    await flush();
    const attempt = last();
    expect(realtime.cancelMatchmaking()).toBe('closed');
    expect(attempt.deactivations).toBe(1);
    expect(state().phase).toBe('idle');
    // Late callbacks of the abandoned attempt change nothing.
    attempt.open();
    expect(attempt.published).toEqual([]);
    attempt.drop();
    expect(state().phase).toBe('idle');
  });

  it('while the token is still being fetched: nothing is ever created', async () => {
    realtime.joinQuickMatch();
    expect(realtime.cancelMatchmaking()).toBe('closed');
    await flush();
    expect(clients).toHaveLength(0);
  });

  it('when not searching: nothing to do', () => {
    expect(realtime.cancelMatchmaking()).toBe('none');
  });
});

describe('sameOriginUrl', () => {
  it('follows the page scheme and host', () => {
    expect(sameOriginUrl({ protocol: 'https:', host: 'minnal.pages.dev' })).toBe('wss://minnal.pages.dev/ws');
    expect(sameOriginUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws');
  });
});
