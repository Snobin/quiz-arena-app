import type { IFrame } from '@stomp/stompjs';
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
import { startRoomMatch } from '../../realtime/liveGameStore.ts';
import {
  USER_PRIVATE_QUEUE,
  type RoomClosedReason,
  type RoomConfigRequest,
  type RoomView,
} from '../../realtime/protocol.ts';
import { navigate } from '../../shell/router.ts';
import {
  configBody,
  joinBody,
  parseRoomIncoming,
  roomConfigure,
  roomLeave,
  roomPlayAgain,
  roomResync,
  roomStart,
  roomTopic,
  ROOM_CREATE,
  ROOM_JOIN,
  type RoomIncoming,
} from './roomProtocol.ts';

/**
 * The Battle Room client (Stories 5.2 and 5.3): the player's own STOMP connection to game-service, opened by the rooms
 * chunk and closed when the room ends. It shares the factory, token and URL of `realtime/connection.ts` (`realtimeEnv`) but
 * none of its match state, so the entry chunk grows by nothing.
 *
 * - The private queue is subscribed before anything is published: game-service answers a subscription with
 *   `ROOM_JOINED` when the player is already in a room (a reload, a dropped socket), and a create reply is the same
 *   message, so nothing may be missed.
 * - `/topic/room/{roomId}` is subscribed once `ROOM_JOINED` names the room. Broadcasts apply in `seq` order (the Story
 *   1.9 rules): one at or below the last seen is dropped; a gap (`seq > lastSeq + 1`) sends one lobby `resync` (again
 *   every `RESYNC_RETRY_MS` while unanswered) and holds the frames until the fresh `ROOM_JOINED`, after which the held
 *   frames above its `refSeq` apply in order.
 * - Start (Story 5.4): the host's start sends `/app/room/{roomId}/start`; `ROOM_LOBBY_UPDATED {phase: STARTING}` marks every
 *   lobby as starting, `ROOM_START_FAILED` returns it to the lobby with the reason, and `ROOM_MATCH_STARTED` hands the match
 *   to the match connection (`startRoomMatch`, which subscribes to `/topic/match/{matchId}`), opens `/match` and closes
 *   this socket. `ROOM_LOBBY_UPDATED`, `ROOM_START_FAILED` and `ROOM_MATCH_STARTED` share the room's `seq`, so they apply
 *   in order together.
 * - A join (Story 5.3) sends `/app/room/join {code}`; the `ROOM_JOINED` with that code, or an `ERROR`, settles it.
 * - A socket that drops while she is in a room is reopened with backoff; game-service keeps her room for its 10 s
 *   grace and answers the new subscription with a fresh `ROOM_JOINED`. If none comes the room is gone.
 */

export * from './roomStore.ts';
import {
  CONFIGURE_TIMEOUT_MS,
  CREATE_TIMEOUT_MS,
  JOIN_TIMEOUT_MS,
  RESUME_TIMEOUT_MS,
  RESYNC_RETRY_MS,
  INITIAL_ROOM_STATE,
  useRoom,
  type CreateResult,
  type JoinResult,
  type RoomClient,
  type RoomError,
  type RoomNotice,
  type RoomSession,
  type RoomState,
} from './roomStore.ts';

type Status = 'closed' | 'connecting' | 'open';

const NOTICES: Record<RoomClosedReason, RoomNotice> = {
  EXPIRED: 'EXPIRED',
  HOST_LEFT: 'CLOSED',
  HOST_DISCONNECTED: 'DISCONNECTED',
  SERVER_DRAINING: 'DRAINING',
  // Never sent to a player (she is in the match by then); read as a plain close should one arrive.
  MATCH_ENDED: 'CLOSED',
};

/** The broadcasts on the room topic: numbered by one `seq`, applied in order. */
type Ordered = Extract<RoomIncoming, { type: 'ROOM_LOBBY_UPDATED' | 'ROOM_START_FAILED' | 'ROOM_MATCH_STARTED' }>;

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
  let joinTimer: ReturnType<typeof setTimeout> | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let resyncTimer: ReturnType<typeof setTimeout> | undefined;
  let creating: { request: Required<RoomConfigRequest>; resolve: (result: CreateResult) => void } | null = null;
  let joining: { code: string; promise: Promise<JoinResult>; resolve: (result: JoinResult) => void } | null = null;
  /** Room broadcast frames held while a resync is out (a seq gap). */
  let held: Ordered[] = [];
  let awaitingResync = false;
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
    resyncTimer = clearTimer(resyncTimer);
    held = [];
    awaitingResync = false;
    const closing = client;
    client = null;
    status = 'closed';
    pending = [];
    void closing?.deactivate();
  }

  /** The room is over for her: no session, no socket, and the notice (when there is one) for the Rooms tab. */
  function end(notice: RoomNotice | null, noticeHost: string | null = null): void {
    createTimer = clearTimer(createTimer);
    configureTimer = clearTimer(configureTimer);
    resumeTimer = clearTimer(resumeTimer);
    startTimer = clearTimer(startTimer);
    retries = 0;
    closeSocket();
    // A player (not the host) whose own connection never came back: her room may well go on without her.
    const lost = notice === 'DISCONNECTED' && get().session !== null && get().session?.role !== 'HOST';
    set({ ...INITIAL_ROOM_STATE, joinFailure: get().joinFailure, notice: lost ? 'LOST' : notice, noticeHost });
  }

  function hostName(session: RoomSession | null): string | null {
    return session?.room.participants.find((p) => p.participantId === session.room.hostParticipantId)?.displayName ?? null;
  }

  function settleJoin(result: JoinResult): void {
    joinTimer = clearTimer(joinTimer);
    const current = joining;
    joining = null;
    if (!current) return;
    const { session } = get();
    set({ phase: session ? 'lobby' : 'idle' });
    if (!result.ok && !session) closeSocket();
    current.resolve(result);
  }

  /** Applies one room broadcast (in order). */
  function applyLobby(incoming: Ordered): void {
    const { session, configuring } = get();
    if (!session) return;
    const seq = incoming.message.seq ?? session.lastSeq;
    if (incoming.type === 'ROOM_START_FAILED') {
      startTimer = clearTimer(startTimer);
      set({ session: { ...session, lastSeq: seq }, starting: false, lobbyPhase: 'LOBBY', startFailure: incoming.payload.reason });
      return;
    }
    if (incoming.type === 'ROOM_MATCH_STARTED') {
      const { payload } = incoming;
      const offset = Date.parse(incoming.message.serverTime) - env.now();
      // The match connection takes over: seeded and subscribed first, then this socket goes and `/match` opens.
      startRoomMatch(
        {
          matchId: payload.matchId,
          mode: payload.mode,
          participants: payload.participants,
          questionCount: payload.questionCount,
          questionSource: payload.questionSource ?? 'BANK',
          selfParticipantId: session.selfParticipantId,
          ...(payload.topic && { topic: payload.topic }),
        },
        payload.firstQuestionAt,
        Number.isFinite(offset) ? offset : 0,
      );
      navigate('/match', { replace: true });
      end(null);
      return;
    }
    const { room, joined, left, phase } = incoming.payload;
    const before = session.room;
    const configChanged =
      before.questionCount !== room.questionCount ||
      before.source.topicId !== room.source.topicId ||
      before.source.customTopicId !== room.source.customTopicId;
    const patch: Partial<RoomState> = {
      session: { ...session, room, lastSeq: seq },
      lobbyEvent: { seq, joined, left },
      lobbyPhase: phase,
    };
    if (phase === 'STARTING') {
      // Her own start (or the host's, for a player) is under way: nothing is waiting on an answer any more.
      startTimer = clearTimer(startTimer);
      Object.assign(patch, { starting: false, startError: null, startFailure: null });
    }
    // A membership-only frame neither closes an open configure nor clears its inline error.
    if (configChanged || (joined.length === 0 && left.length === 0)) {
      if (configuring) configureTimer = clearTimer(configureTimer);
      Object.assign(patch, { configuring: false, error: null });
    }
    // A new topic or count answers the "too few questions" line.
    if (configChanged) Object.assign(patch, { startFailure: null });
    set(patch);
  }

  /** Asks for a fresh `ROOM_JOINED` (a seq gap), again while unanswered. */
  function requestResync(): void {
    resyncTimer = clearTimer(resyncTimer);
    awaitingResync = true;
    const { session } = get();
    if (!session || status !== 'open' || !client) return;
    try {
      client.publish({ destination: roomResync(session.roomId), body: '{}' });
    } catch {
      // The socket is going; the reconnect brings ROOM_JOINED.
    }
    resyncTimer = setTimeout(() => {
      resyncTimer = undefined;
      if (awaitingResync) requestResync();
    }, RESYNC_RETRY_MS);
  }

  /** After a fresh `ROOM_JOINED`: the held frames above it, in order, until the next gap. */
  function drainHeld(): void {
    awaitingResync = false;
    resyncTimer = clearTimer(resyncTimer);
    const frames = held.sort((a, b) => (a.message.seq ?? 0) - (b.message.seq ?? 0));
    held = [];
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]!;
      const last = get().session?.lastSeq ?? 0;
      const seq = frame.message.seq ?? last + 1;
      if (seq <= last) continue;
      if (seq > last + 1) {
        held = frames.slice(i);
        requestResync();
        return;
      }
      applyLobby(frame);
    }
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
        const previous = get().session;
        if (previous && previous.roomId !== payload.roomId) held = [];
        set({ session, reconnecting: false, phase: get().phase === 'idle' ? 'lobby' : get().phase });
        subscribeTopic(payload.roomId);
        drainHeld();
        if (creating && sameConfig(creating.request, payload.room)) settleCreate({ ok: true, session });
        if (joining && joining.code === payload.code) settleJoin({ ok: true, session });
        if (resuming) {
          const done = resuming;
          resuming = null;
          resumePromise = null;
          set({ phase: 'lobby' });
          done(true);
        }
        return;
      }
      case 'ROOM_LOBBY_UPDATED':
      case 'ROOM_START_FAILED':
      case 'ROOM_MATCH_STARTED': {
        const { session } = get();
        if (!session || message.roomId !== session.roomId) return;
        if (message.seq === undefined) {
          applyLobby(incoming);
          return;
        }
        if (message.seq <= session.lastSeq) return;
        if (awaitingResync || message.seq > session.lastSeq + 1) {
          held.push(incoming);
          if (!awaitingResync) requestResync();
          return;
        }
        applyLobby(incoming);
        return;
      }
      case 'ROOM_CLOSED': {
        const { session } = get();
        if (session && message.roomId !== undefined && message.roomId !== session.roomId) return;
        const { reason } = incoming.payload;
        const hostGone = reason === 'HOST_LEFT' || reason === 'HOST_DISCONNECTED';
        if (session && session.role !== 'HOST' && hostGone) end('HOST_CLOSED', hostName(session));
        else end(NOTICES[reason]);
        if (creating) settleCreateAfterEnd();
        if (joining) settleJoin({ ok: false, error: { code: 'ROOM_EXPIRED' } });
        return;
      }
      case 'ERROR': {
        const error: RoomError = { code: incoming.payload.code, roomId: incoming.payload.roomId, matchId: incoming.payload.matchId };
        if (joining) {
          settleJoin({ ok: false, error });
        } else if (creating) {
          settleCreate({ ok: false, error });
        } else if (resuming) {
          settleResume(false);
        } else if (get().starting) {
          startTimer = clearTimer(startTimer);
          set({ starting: false, startError: error });
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
    if (room.questionCount !== request.questionCount) return false;
    if (request.source.type === 'CUSTOM') {
      // A play again names no id (the server keeps the old source): any custom room with that count is the successor.
      return room.source.type === 'CUSTOM' && (request.source.customTopicId === undefined || room.source.customTopicId === request.source.customTopicId);
    }
    return room.source.type !== 'CUSTOM' && room.source.topicId === request.source.topicId;
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
    resyncTimer = clearTimer(resyncTimer);
    if (joining) settleJoin({ ok: false, error: { code: 'CONNECTION' } });
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
    if (get().starting) {
      startTimer = clearTimer(startTimer);
      set({ starting: false, startError: { code: 'CONNECTION' } });
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
    joinTimer = clearTimer(joinTimer);
    startTimer = clearTimer(startTimer);
    creating?.resolve({ ok: false, error: { code: 'CONNECTION' } });
    creating = null;
    joining?.resolve({ ok: false, error: { code: 'CONNECTION' } });
    joining = null;
    resuming?.(false);
    resuming = null;
    resumePromise = null;
    closeSocket();
    retries = 0;
    set(INITIAL_ROOM_STATE);
  }

  /** A create, or a play again: both end in the host's own `ROOM_JOINED` for a lobby with `config`. */
  function openLobby(config: Required<RoomConfigRequest>, destination: string, body: string): Promise<CreateResult> {
    if (creating) return Promise.resolve({ ok: false, error: { code: 'BAD_REQUEST' } });
    return new Promise<CreateResult>((resolve) => {
      creating = { request: config, resolve };
      set({ phase: 'creating', error: null, notice: null });
      createTimer = setTimeout(() => settleCreate({ ok: false, error: { code: 'TIMEOUT' } }), CREATE_TIMEOUT_MS);
      send((c) => c.publish({ destination, body }));
    });
  }

  return {
    create(config) {
      return openLobby(config, ROOM_CREATE, configBody(config));
    },
    playAgain(oldRoomId, config) {
      return openLobby(config, roomPlayAgain(oldRoomId), '{}');
    },
    join(code) {
      if (joining) {
        // The same code again (a second tap): the join in flight. Another code: refused, the first one still runs.
        if (joining.code === code) return joining.promise;
        return Promise.resolve({ ok: false, error: { code: 'BAD_REQUEST' } });
      }
      let resolve!: (result: JoinResult) => void;
      const promise = new Promise<JoinResult>((r) => {
        resolve = r;
      });
      joining = { code, promise, resolve };
      set({ phase: get().session ? get().phase : 'joining', notice: null });
      joinTimer = clearTimer(joinTimer);
      joinTimer = setTimeout(() => settleJoin({ ok: false, error: { code: 'TIMEOUT' } }), JOIN_TIMEOUT_MS);
      send((c) => c.publish({ destination: ROOM_JOIN, body: joinBody(code) }));
      return promise;
    },
    start() {
      const { session, starting } = get();
      if (!session || session.role !== 'HOST' || starting) return;
      set({ starting: true, startError: null, startFailure: null });
      startTimer = clearTimer(startTimer);
      startTimer = setTimeout(() => {
        startTimer = undefined;
        set({ starting: false, startError: { code: 'TIMEOUT' } });
      }, CONFIGURE_TIMEOUT_MS);
      send((c) => c.publish({ destination: roomStart(session.roomId), body: '{}' }));
    },
    setJoinFailure(failure) {
      set({ joinFailure: failure });
    },
    clearJoinFailure() {
      if (get().joinFailure) set({ joinFailure: null });
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
