import { Client, type IFrame, type IMessage, type StompConfig, type StompSubscription } from '@stomp/stompjs';
import { guestSession } from '../auth/guestSession.ts';
import { INITIAL_LIVE_GAME, liveGameStore, liveMatchFor, type LiveGameState, type LiveMatch } from './liveGameStore.ts';
import {
  ENDPOINT_PATH,
  matchAnswer,
  matchmakingCancel,
  matchmakingJoin,
  matchTopic,
  parseIncoming,
  USER_PRIVATE_QUEUE,
  type Incoming,
} from './protocol.ts';

/**
 * The single WebSocket connection (AD-18): the app's only `@stomp/stompjs` client, and the only
 * writer of the live-game store.
 *
 * - Same-origin `ws(s)://<host>/ws`, with the guest token as `Authorization: Bearer` on CONNECT.
 * - Opened lazily by the first join, then kept open. No auto-reconnect (Story 1.9).
 * - A CONNECT refused as `UNAUTHENTICATED` invalidates the token and retries once with a new one.
 * - Private messages (`/user/queue/game`) are parsed and turned into store updates.
 * - On MATCH_FOUND it subscribes to `/topic/match/{matchId}` at once (the server's lead-in covers
 *   this step, so Q1 is never missed) and drops the previous match's subscription. Broadcasts
 *   are applied in arrival order; one with `seq ≤ lastSeq` is a duplicate and dropped (gap
 *   resync is Story 1.9).
 * - `submitAnswer` sends the open question's answer; ANSWER_ACCEPTED locks it, a rejection
 *   clears it silently.
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
  /** Sends an answer to the open question. False when it is not sendable (not open, already answered, socket closed). */
  submitAnswer: (optionIndex: number) => boolean;
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
  /** The current match topic subscription. */
  let topic: { unsubscribe: () => void } | null = null;

  const set = (patch: Partial<LiveGameState>) => liveGameStore.setState(patch);
  const phase = () => liveGameStore.getState().phase;
  const live = () => liveGameStore.getState().live;
  const setLive = (patch: Partial<LiveMatch>) => {
    const current = live();
    if (current) set({ live: { ...current, ...patch } });
  };

  function dropTopic(): void {
    const previous = topic;
    topic = null;
    try {
      previous?.unsubscribe();
    } catch {
      // The socket is already gone: nothing to unsubscribe from.
    }
  }

  /** Subscribes to the match topic on the open client; its frames go to `onIncoming` only while it is current. */
  function subscribeTopic(matchId: string): void {
    dropTopic();
    if (status !== 'open' || !client) return;
    const attempt = generation;
    const subscription = client.subscribe(matchTopic(matchId), (message) => {
      if (attempt !== generation || topic !== handle) return;
      const incoming = parseIncoming(message.body);
      if (incoming) onIncoming(incoming);
    });
    const handle = { unsubscribe: () => subscription.unsubscribe() };
    topic = handle;
  }

  /**
   * A match broadcast for the live match: true when it should be applied. Messages for another
   * match are ignored, and one at or below `lastSeq` is a duplicate.
   */
  function acceptBroadcast(incoming: Incoming): LiveMatch | null {
    const current = live();
    if (!current || incoming.message.matchId !== current.matchId) return null;
    const { seq } = incoming.message;
    if (seq !== undefined && seq <= current.lastSeq) return null;
    return current;
  }

  function onMatchMessage(incoming: Incoming, clockOffsetMs: number): boolean {
    switch (incoming.type) {
      case 'QUESTION_STARTED': {
        const current = acceptBroadcast(incoming);
        if (!current) break;
        set({
          clockOffsetMs,
          live: {
            ...current,
            phase: 'open',
            question: incoming.payload,
            answered: [],
            myAnswer: null,
            reveal: null,
            lastSeq: incoming.message.seq ?? current.lastSeq,
          },
        });
        return true;
      }
      case 'SCOREBOARD': {
        const current = acceptBroadcast(incoming);
        if (!current) break;
        const sameQuestion = current.question?.questionIndex === incoming.payload.questionIndex;
        set({
          clockOffsetMs,
          live: {
            ...current,
            answered: sameQuestion ? incoming.payload.answered : current.answered,
            lastSeq: incoming.message.seq ?? current.lastSeq,
          },
        });
        return true;
      }
      case 'QUESTION_REVEALED': {
        const current = acceptBroadcast(incoming);
        if (!current) break;
        const { payload } = incoming;
        const totals = { ...current.totals };
        for (const result of payload.results) totals[result.participantId] = result.totalScore;
        set({
          clockOffsetMs,
          live: {
            ...current,
            phase: payload.questionIndex >= payload.total - 1 ? 'ended' : 'revealed',
            reveal: payload,
            totals,
            lastSeq: incoming.message.seq ?? current.lastSeq,
          },
        });
        // Nothing follows the last reveal: drop the topic, keep the slice for the end view.
        if (payload.questionIndex >= payload.total - 1) dropTopic();
        return true;
      }
      case 'ANSWER_ACCEPTED': {
        const current = live();
        const mine = current?.myAnswer;
        if (current && incoming.message.matchId === current.matchId && mine?.status === 'pending' && mine.questionIndex === incoming.payload.questionIndex) {
          set({ clockOffsetMs, live: { ...current, myAnswer: { ...mine, status: 'locked' } } });
        } else {
          set({ clockOffsetMs });
        }
        return true;
      }
      case 'ERROR': {
        const { code } = incoming.payload;
        if (code !== 'ANSWER_REJECTED' && code !== 'NOT_IN_MATCH') return false;
        // A refused answer for the live match: the option unlocks with no message. Anything else
        // (no pending answer, another match) takes the ordinary error path.
        const current = live();
        const errorMatch = incoming.payload.matchId ?? incoming.message.matchId;
        if (current?.myAnswer?.status !== 'pending') return false;
        if (errorMatch !== undefined && errorMatch !== current.matchId) return false;
        set({ clockOffsetMs, live: { ...current, myAnswer: null } });
        return true;
      }
      default:
        return false;
    }
    set({ clockOffsetMs });
    return true;
  }

  function connectionLost(): void {
    const current = phase();
    if (current === 'searching' || current === 'cancelling') set({ phase: 'failed', problem: { kind: 'connection' } });
  }

  function onIncoming(incoming: Incoming): void {
    const offset = Date.parse(incoming.message.serverTime) - env.now();
    const clockOffsetMs = Number.isFinite(offset) ? offset : liveGameStore.getState().clockOffsetMs;
    if (onMatchMessage(incoming, clockOffsetMs)) return;
    switch (incoming.type) {
      case 'MATCH_FOUND':
        set({ phase: 'found', match: incoming.payload, problem: null, clockOffsetMs, live: liveMatchFor(incoming.payload) });
        subscribeTopic(incoming.payload.matchId);
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
            topic = null;
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
    dropTopic();
    const closing = client;
    client = null;
    status = 'closed';
    pending = [];
    void closing?.deactivate();
  }

  return {
    joinQuickMatch() {
      // A new search: an ended match is gone from /match. A match still in play is kept (topic
      // included), so ALREADY_IN_MATCH → "Back to your match" can still show it.
      if (live()?.phase === 'ended') {
        dropTopic();
        set({ live: null });
      }
      set({ phase: 'searching', problem: null });
      send((c) => c.publish({ destination: matchmakingJoin('QUICK'), body: '{}' }));
    },
    submitAnswer(optionIndex) {
      const current = live();
      if (!current || current.phase !== 'open' || current.myAnswer !== null || !current.question) return false;
      if (status !== 'open' || !client) return false;
      // Past the deadline on the server clock: the server would reject it, so don't send.
      const deadline = Date.parse(current.question.deadline);
      if (deadline - (env.now() + liveGameStore.getState().clockOffsetMs) <= 0) return false;
      const { questionIndex } = current.question;
      setLive({ myAnswer: { questionIndex, optionIndex, status: 'pending' } });
      try {
        client.publish({ destination: matchAnswer(current.matchId), body: JSON.stringify({ questionIndex, optionIndex }) });
      } catch {
        setLive({ myAnswer: null });
        return false;
      }
      return true;
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

/** Answers the open question (Story 1.8). See `Realtime.submitAnswer`. */
export function submitAnswer(optionIndex: number): boolean {
  return instance().submitAnswer(optionIndex);
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
