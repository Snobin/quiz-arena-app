import { Client, type IFrame, type IMessage, type StompConfig, type StompSubscription } from '@stomp/stompjs';
import { guestSession } from '../auth/guestSession.ts';
import { INITIAL_LIVE_GAME, liveGameStore, type LiveGameState } from './liveGameStore.ts';
import { ENDPOINT_PATH, matchmakingCancel, matchmakingJoin, parseIncoming, USER_PRIVATE_QUEUE, type Incoming } from './protocol.ts';

/**
 * The single WebSocket connection (AD-18): the app's only `@stomp/stompjs` client, and the only
 * writer of the live-game store.
 *
 * - Same-origin `ws(s)://<host>/ws`, with the guest token as `Authorization: Bearer` on CONNECT.
 * - Opened lazily by the first join, then kept open. No auto-reconnect (Story 1.9).
 * - A CONNECT refused as `UNAUTHENTICATED` invalidates the token and retries once with a new one.
 * - Private messages (`/user/queue/game`) are parsed and turned into store updates.
 */

/** The part of the stompjs `Client` this module uses; tests inject a fake through the factory. */
export type RealtimeClient = {
  readonly connected: boolean;
  activate(): void;
  deactivate(): Promise<void> | void;
  publish(params: { destination: string; body?: string }): void;
  subscribe(destination: string, callback: (message: Pick<IMessage, 'body'>) => void): Pick<StompSubscription, 'unsubscribe'>;
};

export type ClientFactory = (config: StompConfig) => RealtimeClient;

export type RealtimeEnv = {
  factory: ClientFactory;
  getAccessToken: () => Promise<string>;
  invalidate: (token: string) => void;
  url: () => string;
  now: () => number;
};

/** The STOMP ERROR `message` game-service sends for a refused CONNECT. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';
export const HEARTBEAT_MS = 10_000;

/** `ws(s)://<host>/ws` for the current page. */
export function sameOriginUrl(location: Pick<Location, 'protocol' | 'host'> = window.location): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${ENDPOINT_PATH}`;
}

export const defaultFactory: ClientFactory = (config) => new Client(config);

function defaultEnv(): RealtimeEnv {
  return {
    factory: defaultFactory,
    getAccessToken: () => guestSession.getAccessToken(),
    invalidate: (token) => guestSession.invalidate(token),
    url: () => sameOriginUrl(),
    now: () => Date.now(),
  };
}

export type CancelResult = 'sent' | 'closed' | 'none';

export type Realtime = {
  joinQuickMatch: () => void;
  /** 'sent': wait for MATCHMAKING_CANCELLED; 'closed': the attempt is gone, go Home now; 'none': not searching. */
  cancelMatchmaking: () => CancelResult;
  /** Closes the socket and resets the store (tests). */
  reset: () => void;
};

type Status = 'closed' | 'connecting' | 'open';

export function createRealtime(env: RealtimeEnv): Realtime {
  let client: RealtimeClient | null = null;
  let status: Status = 'closed';
  /** Sends waiting for the socket to open. */
  let pending: Array<(c: RealtimeClient) => void> = [];
  /** Bumped whenever an attempt is abandoned, so its late callbacks are ignored. */
  let generation = 0;

  const set = (patch: Partial<LiveGameState>) => liveGameStore.setState(patch);
  const phase = () => liveGameStore.getState().phase;

  function connectionLost(): void {
    const current = phase();
    if (current === 'searching' || current === 'cancelling') set({ phase: 'failed', problem: { kind: 'connection' } });
  }

  function onIncoming(incoming: Incoming): void {
    const offset = Date.parse(incoming.message.serverTime) - env.now();
    const clockOffsetMs = Number.isFinite(offset) ? offset : liveGameStore.getState().clockOffsetMs;
    switch (incoming.type) {
      case 'MATCH_FOUND':
        set({ phase: 'found', match: incoming.payload, problem: null, clockOffsetMs });
        return;
      case 'MATCHMAKING_FAILED':
        set({ phase: 'failed', problem: { kind: 'matchmaking' }, clockOffsetMs });
        return;
      case 'MATCHMAKING_CANCELLED':
        // Only an outstanding cancel ends the search: a late ack (e.g. from a previous visit's
        // unmount cancel) must not end a search started since.
        if (phase() === 'cancelling') set({ phase: 'cancelled', problem: null, clockOffsetMs });
        else set({ clockOffsetMs });
        return;
      case 'ERROR': {
        const { code, matchId } = incoming.payload;
        if (code === 'CANCEL_REJECTED') {
          // Paired already: MATCH_FOUND follows.
          if (phase() === 'cancelling') set({ phase: 'searching', clockOffsetMs });
          return;
        }
        if (code === 'NOT_IN_QUEUE' && phase() === 'cancelling') {
          set({ phase: 'cancelled', problem: null, clockOffsetMs });
          return;
        }
        const problem =
          code === 'SERVER_DRAINING'
            ? ({ kind: 'draining' } as const)
            : code === 'ALREADY_IN_MATCH'
              ? ({ kind: 'alreadyInMatch', ...(matchId ? { matchId } : {}) } as const)
              : ({ kind: 'rejected', code } as const);
        set({ phase: 'failed', problem, clockOffsetMs });
        return;
      }
      default:
        set({ clockOffsetMs });
    }
  }

  function open(retryOnAuth: boolean): void {
    status = 'connecting';
    const attempt = ++generation;
    env.getAccessToken().then(
      (token) => {
        if (attempt !== generation) return;
        let refused = false;
        const created = env.factory({
          brokerURL: env.url(),
          connectHeaders: { Authorization: `Bearer ${token}` },
          reconnectDelay: 0,
          heartbeatIncoming: HEARTBEAT_MS,
          heartbeatOutgoing: HEARTBEAT_MS,
          onConnect: () => {
            if (attempt !== generation) return;
            status = 'open';
            created.subscribe(USER_PRIVATE_QUEUE, (message) => {
              if (attempt !== generation) return;
              const incoming = parseIncoming(message.body);
              if (incoming) onIncoming(incoming);
            });
            const sends = pending;
            pending = [];
            for (const send of sends) send(created);
          },
          onStompError: (frame: IFrame) => {
            if (attempt !== generation) return;
            if (status === 'connecting' && frame.headers.message === UNAUTHENTICATED) refused = true;
          },
          onWebSocketClose: () => {
            if (attempt !== generation) return;
            const wasOpen = status === 'open';
            client = null;
            status = 'closed';
            if (!wasOpen && refused && retryOnAuth) {
              // The token was refused: drop it and try once more with a fresh one.
              env.invalidate(token);
              open(false);
              return;
            }
            pending = [];
            connectionLost();
          },
        });
        client = created;
        created.activate();
      },
      () => {
        if (attempt !== generation) return;
        status = 'closed';
        pending = [];
        connectionLost();
      },
    );
  }

  function send(action: (c: RealtimeClient) => void): void {
    if (status === 'open' && client) {
      action(client);
      return;
    }
    pending.push(action);
    if (status === 'closed') open(true);
  }

  function close(): void {
    generation++;
    const closing = client;
    client = null;
    status = 'closed';
    pending = [];
    void closing?.deactivate();
  }

  return {
    joinQuickMatch() {
      set({ phase: 'searching', problem: null });
      send((c) => c.publish({ destination: matchmakingJoin('QUICK'), body: '{}' }));
    },
    cancelMatchmaking() {
      if (phase() !== 'searching') return 'none';
      if (status === 'open' && client) {
        set({ phase: 'cancelling' });
        client.publish({ destination: matchmakingCancel('QUICK'), body: '{}' });
        return 'sent';
      }
      // Not open yet: nothing reached the server, so abandoning the attempt is the cancel.
      close();
      set({ phase: 'idle', problem: null });
      return 'closed';
    },
    reset() {
      close();
      liveGameStore.setState(INITIAL_LIVE_GAME, true);
    },
  };
}

let realtime: Realtime | null = null;
let envOverride: Partial<RealtimeEnv> = {};

function instance(): Realtime {
  realtime ??= createRealtime({ ...defaultEnv(), ...envOverride });
  return realtime;
}

/** Joins the Quick Match queue, connecting first if needed. */
export function joinQuickMatch(): void {
  instance().joinQuickMatch();
}

/** Cancels the search. See `CancelResult`. */
export function cancelMatchmaking(): CancelResult {
  return instance().cancelMatchmaking();
}

/** Test helper: replaces parts of the environment (e.g. the client factory) and resets the module. */
export function configureRealtimeForTests(override: Partial<RealtimeEnv>): void {
  realtime?.reset();
  realtime = null;
  envOverride = override;
}

/** Test helper: closes the socket, resets the store and drops overrides. */
export function resetRealtime(): void {
  realtime?.reset();
  realtime = null;
  envOverride = {};
  liveGameStore.setState(INITIAL_LIVE_GAME, true);
}
