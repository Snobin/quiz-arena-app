import type { IFrame } from '@stomp/stompjs';
import { create } from 'zustand';
import {
  HEARTBEAT_MS,
  onRealtimeClose,
  realtimeEnv,
  RETRY_DELAYS_MS,
  RETRY_WINDOW_MS,
  UNAUTHENTICATED,
  type RealtimeClient,
  type RealtimeEnv,
} from '../../realtime/connection.ts';
import { USER_PRIVATE_QUEUE, type ErrorCode, type RoomClosedReason, type RoomConfigRequest, type RoomRole, type RoomView } from '../../realtime/protocol.ts';
import { configBody, parseRoomIncoming, roomConfigure, roomLeave, roomTopic, ROOM_CREATE, type RoomIncoming } from './roomProtocol.ts';

/**
 * The Battle Room client (Story 5.2): the host's own STOMP connection to game-service, opened by the rooms chunk and
 * closed when the room ends. It shares the factory, token and URL of `realtime/connection.ts` (`realtimeEnv`) but
 * none of its match state, so the entry chunk grows by nothing.
 *
 * - The private queue is subscribed before anything is published: game-service answers a subscription with
 *   `ROOM_JOINED` when the player is already in a room (a reload, a dropped socket), and a create reply is the same
 *   message, so nothing may be missed.
 * - `/topic/room/{roomId}` is subscribed once `ROOM_JOINED` names the room. Broadcasts apply in `seq` order; one at or
 *   below the last seen is dropped.
 * - A socket that drops while she is in a room is reopened with backoff; game-service keeps her room for its 10 s
 *   grace and answers the new subscription with a fresh `ROOM_JOINED`. If none comes the room is gone.
 */

export type RoomSession = { roomId: string; code: string; role: RoomRole; selfParticipantId: string; room: RoomView; lastSeq: number };

/** Why a create, configure or resume failed: a server `ERROR` code, or a local reason. */
export type RoomErrorCode = ErrorCode | 'CONNECTION' | 'TIMEOUT';
export type RoomError = { code: RoomErrorCode; roomId?: string; matchId?: string };

/** Why she was sent back to the Rooms tab. */
export type RoomNotice = 'EXPIRED' | 'DISCONNECTED' | 'DRAINING' | 'CLOSED';

export type RoomPhase = 'idle' | 'creating' | 'resuming' | 'lobby';

export type RoomState = {
  phase: RoomPhase;
  session: RoomSession | null;
  /** A configure sent and not yet answered. */
  configuring: boolean;
  /** The last failed create (before a lobby exists) or configure (inside it). */
  error: RoomError | null;
  /** Set when the room ended under her; the Rooms tab shows it once. */
  notice: RoomNotice | null;
  reconnecting: boolean;
};

export const INITIAL_ROOM_STATE: RoomState = { phase: 'idle', session: null, configuring: false, error: null, notice: null, reconnecting: false };

export const useRoom = create<RoomState>(() => INITIAL_ROOM_STATE);

/** A create with no reply within this fails (the player can try again). */
export const CREATE_TIMEOUT_MS = 10_000;
/** A configure with no reply within this stops waiting. */
export const CONFIGURE_TIMEOUT_MS = 8_000;
/** A resume, or a reconnect, with no `ROOM_JOINED` within this finds the room gone. */
export const RESUME_TIMEOUT_MS = 5_000;

export type CreateResult = { ok: true; session: RoomSession } | { ok: false; error: RoomError };

export type RoomClient = {
  /** Opens a room with `config`. Resolves with the lobby, or with the error to show inline. */
  create(config: Required<RoomConfigRequest>): Promise<CreateResult>;
  /** Re-reads a room she is already in (a reload on `/r/<code>`). Resolves false when there is none. */
  resume(): Promise<boolean>;
  /** Sends a configure for the room she is in. */
  configure(config: RoomConfigRequest): void;
  /** Leaves on purpose: no confirm, the room closes, nothing is shown. */
  leave(): void;
  clearError(): void;
  dismissNotice(): void;
  reset(): void;
};

type Status = 'closed' | 'connecting' | 'open';

const NOTICES: Record<RoomClosedReason, RoomNotice> = {
  EXPIRED: 'EXPIRED',
  HOST_LEFT: 'CLOSED',
  HOST_DISCONNECTED: 'DISCONNECTED',
  SERVER_DRAINING: 'DRAINING',
};

export function createRoomClient(env: RealtimeEnv): RoomClient {
  let client: RealtimeClient | null = null;
  let status: Status = 'closed';
  /** Sends waiting for the socket to open. */
  let pending: Array<(c: RealtimeClient) => void> = [];
  /** Bumped whenever an attempt is abandoned, so its late callbacks are ignored. */
  let generation = 0;
  let topic: { roomId: string; unsubscribe: () => void } | null = null;
  let retries = 0;
  let droppedAt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let createTimer: ReturnType<typeof setTimeout> | undefined;
  let configureTimer: ReturnType<typeof setTimeout> | undefined;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  let creating: { request: Required<RoomConfigRequest>; resolve: (result: CreateResult) => void } | null = null;
  let resuming: ((found: boolean) => void) | null = null;
  let resumePromise: Promise<boolean> | null = null;

  const get = () => useRoom.getState();
  const set = (patch: Partial<RoomState>) => useRoom.setState(patch);

  const clearTimer = (timer: ReturnType<typeof setTimeout> | undefined): undefined => {
    if (timer !== undefined) clearTimeout(timer);
    return undefined;
  };

  function dropTopic(): void {
    const previous = topic;
    topic = null;
    try {
      previous?.unsubscribe();
    } catch {
      // The socket is already gone.
    }
  }

  function closeSocket(): void {
    generation++;
    dropTopic();
    retryTimer = clearTimer(retryTimer);
    const closing = client;
    client = null;
    status = 'closed';
    pending = [];
    void closing?.deactivate();
  }

  /** The room is over for her: no session, no socket, and the notice (when there is one) for the Rooms tab. */
  function end(notice: RoomNotice | null): void {
    createTimer = clearTimer(createTimer);
    configureTimer = clearTimer(configureTimer);
    resumeTimer = clearTimer(resumeTimer);
    retries = 0;
    closeSocket();
    set({ ...INITIAL_ROOM_STATE, notice });
  }

  function settleCreate(result: CreateResult): void {
    createTimer = clearTimer(createTimer);
    const current = creating;
    creating = null;
    if (!current) return;
    const { session } = get();
    set({ phase: session ? 'lobby' : 'idle', error: result.ok ? null : result.error });
    if (!result.ok && !session) closeSocket();
    current.resolve(result);
  }

  function settleResume(found: boolean): void {
    resumeTimer = clearTimer(resumeTimer);
    const current = resuming;
    resuming = null;
    resumePromise = null;
    if (!current) return;
    if (!found) {
      closeSocket();
      set({ phase: get().session ? 'lobby' : 'idle' });
    }
    current(found);
  }

  function subscribeTopic(roomId: string): void {
    if (topic?.roomId === roomId) return;
    dropTopic();
    if (status !== 'open' || !client) return;
    const attempt = generation;
    const subscription = client.subscribe(roomTopic(roomId), (message) => {
      if (attempt !== generation || topic !== handle) return;
      const incoming = parseRoomIncoming(message.body);
      if (incoming) onIncoming(incoming);
    });
    const handle = { roomId, unsubscribe: () => subscription.unsubscribe() };
    topic = handle;
  }

  function onIncoming(incoming: RoomIncoming): void {
    const { message } = incoming;
    switch (incoming.type) {
      case 'ROOM_JOINED': {
        const { payload } = incoming;
        const session: RoomSession = { ...payload, lastSeq: message.refSeq ?? 0 };
        retries = 0;
        resumeTimer = clearTimer(resumeTimer);
        // Whichever room game-service says she is in: its state replaces what she had.
        set({ session, reconnecting: false, phase: get().phase === 'idle' ? 'lobby' : get().phase });
        subscribeTopic(payload.roomId);
        if (creating && sameConfig(creating.request, payload.room)) settleCreate({ ok: true, session });
        if (resuming) {
          const done = resuming;
          resuming = null;
          resumePromise = null;
          set({ phase: 'lobby' });
          done(true);
        }
        return;
      }
      case 'ROOM_LOBBY_UPDATED': {
        const { session } = get();
        if (!session || message.roomId !== session.roomId) return;
        if (message.seq !== undefined && message.seq <= session.lastSeq) return;
        configureTimer = clearTimer(configureTimer);
        set({ session: { ...session, room: incoming.payload.room, lastSeq: message.seq ?? session.lastSeq }, configuring: false, error: null });
        return;
      }
      case 'ROOM_CLOSED': {
        const { session } = get();
        if (session && message.roomId !== undefined && message.roomId !== session.roomId) return;
        const notice = NOTICES[incoming.payload.reason];
        end(notice);
        if (creating) settleCreateAfterEnd();
        return;
      }
      case 'ERROR': {
        const error: RoomError = { code: incoming.payload.code, roomId: incoming.payload.roomId, matchId: incoming.payload.matchId };
        if (creating) {
          settleCreate({ ok: false, error });
        } else if (resuming) {
          settleResume(false);
        } else if (get().configuring) {
          configureTimer = clearTimer(configureTimer);
          set({ configuring: false, error });
        }
        return;
      }
      default:
        return;
    }
  }

  /** A close that arrives while a create is open: the create is over without a lobby. */
  function settleCreateAfterEnd(): void {
    const current = creating;
    creating = null;
    current?.resolve({ ok: false, error: { code: 'CONNECTION' } });
  }

  function sameConfig(request: Required<RoomConfigRequest>, room: RoomView): boolean {
    return room.source.topicId === request.source.topicId && room.questionCount === request.questionCount;
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
              const incoming = parseRoomIncoming(message.body);
              if (incoming) onIncoming(incoming);
            });
            const sends = pending;
            pending = [];
            for (const send of sends) send(created);
            const { session } = get();
            if (session) {
              subscribeTopic(session.roomId);
              if (get().reconnecting) {
                // The server answers the private subscription with ROOM_JOINED if the room is still hers.
                resumeTimer = clearTimer(resumeTimer);
                resumeTimer = setTimeout(() => end('CLOSED'), RESUME_TIMEOUT_MS);
              }
            }
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
              env.invalidate(token);
              open(false);
              return;
            }
            connectionLost(wasOpen);
          },
        });
        client = created;
        created.activate();
      },
      () => {
        if (attempt !== generation) return;
        status = 'closed';
        connectionLost(false);
      },
    );
  }

  /** The socket closed or never opened. In a lobby it is reopened; anything waiting on it fails. */
  function connectionLost(wasOpen: boolean): void {
    pending = [];
    if (creating) {
      settleCreate({ ok: false, error: { code: 'CONNECTION' } });
      return;
    }
    if (resuming) {
      settleResume(false);
      return;
    }
    const { session } = get();
    if (!session) return;
    if (get().configuring) {
      configureTimer = clearTimer(configureTimer);
      set({ configuring: false, error: { code: 'CONNECTION' } });
    }
    resumeTimer = clearTimer(resumeTimer);
    if (!get().reconnecting || wasOpen) {
      droppedAt = Date.now();
      retries = 0;
    }
    if (Date.now() - droppedAt > RETRY_WINDOW_MS) {
      end('DISCONNECTED');
      return;
    }
    set({ reconnecting: true });
    const delay = RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)]!;
    retries++;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (status === 'closed' && get().session) open(true);
    }, delay);
  }

  function send(action: (c: RealtimeClient) => void): void {
    if (status === 'open' && client) {
      action(client);
      return;
    }
    pending.push(action);
    if (status === 'closed') open(true);
  }

  function reset(): void {
    createTimer = clearTimer(createTimer);
    configureTimer = clearTimer(configureTimer);
    resumeTimer = clearTimer(resumeTimer);
    creating?.resolve({ ok: false, error: { code: 'CONNECTION' } });
    creating = null;
    resuming?.(false);
    resuming = null;
    resumePromise = null;
    closeSocket();
    retries = 0;
    set(INITIAL_ROOM_STATE);
  }

  return {
    create(config) {
      if (creating) return Promise.resolve({ ok: false, error: { code: 'BAD_REQUEST' } });
      return new Promise<CreateResult>((resolve) => {
        creating = { request: config, resolve };
        set({ phase: 'creating', error: null, notice: null });
        createTimer = setTimeout(() => settleCreate({ ok: false, error: { code: 'TIMEOUT' } }), CREATE_TIMEOUT_MS);
        send((c) => c.publish({ destination: ROOM_CREATE, body: configBody(config) }));
      });
    },
    resume() {
      if (get().session) return Promise.resolve(true);
      if (resumePromise) return resumePromise;
      resumePromise = new Promise<boolean>((resolve) => {
        resuming = resolve;
        set({ phase: 'resuming', error: null });
        resumeTimer = setTimeout(() => settleResume(false), RESUME_TIMEOUT_MS);
        // Nothing is published: the private subscription itself brings ROOM_JOINED when she is in a room.
        send(() => undefined);
      });
      return resumePromise;
    },
    configure(config) {
      const { session, configuring } = get();
      if (!session || configuring) return;
      set({ configuring: true, error: null });
      configureTimer = clearTimer(configureTimer);
      configureTimer = setTimeout(() => {
        configureTimer = undefined;
        set({ configuring: false, error: { code: 'TIMEOUT' } });
      }, CONFIGURE_TIMEOUT_MS);
      send((c) => c.publish({ destination: roomConfigure(session.roomId), body: configBody(config) }));
    },
    leave() {
      const { session } = get();
      if (session && status === 'open' && client) {
        try {
          client.publish({ destination: roomLeave(session.roomId), body: '{}' });
        } catch {
          // The socket is going; game-service closes the room after its grace.
        }
      }
      end(null);
    },
    clearError() {
      if (get().error) set({ error: null });
    },
    dismissNotice() {
      if (get().notice) set({ notice: null });
    },
    reset,
  };
}

let instance: RoomClient | null = null;
let removeHook: (() => void) | null = null;

/** The room client, created on first use (the rooms chunk only) from the shared socket environment. */
export function roomClient(): RoomClient {
  if (!instance) {
    instance = createRoomClient(realtimeEnv());
    // Sign-out, account deletion and the test helpers close it too; it is rebuilt with the then-current environment.
    removeHook = onRealtimeClose(() => {
      instance?.reset();
      removeHook?.();
      removeHook = null;
      instance = null;
    });
  }
  return instance;
}

/** Test helper: closes the socket, empties the store and drops the instance. */
export function resetRoomClient(): void {
  instance?.reset();
  removeHook?.();
  removeHook = null;
  instance = null;
  useRoom.setState(INITIAL_ROOM_STATE);
}
