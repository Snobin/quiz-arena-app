import {
  onRealtimeClose,
  realtimeEnv,
  RETRY_DELAYS_MS,
  RETRY_WINDOW_MS,
  type RealtimeEnv,
} from '../../realtime/connection.ts';
import { startRoomMatch } from '../../realtime/liveGameStore.ts';
import type { RoomConfigRequest } from '../../realtime/protocol.ts';
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
  ROOM_CREATE,
  ROOM_JOIN,
  type RoomIncoming,
} from './roomProtocol.ts';
import { hostName, lobbyUpdate, NOTICES, sameConfig, type Ordered } from './roomLobby.ts';
import { createSeqGate } from './roomSeqGate.ts';
import { createRoomTransport } from './roomTransport.ts';

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

export function createRoomClient(env: RealtimeEnv): RoomClient {
  let retries = 0;
  let droppedAt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let createTimer: ReturnType<typeof setTimeout> | undefined;
  let configureTimer: ReturnType<typeof setTimeout> | undefined;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  let joinTimer: ReturnType<typeof setTimeout> | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let creating: { request: Required<RoomConfigRequest>; resolve: (result: CreateResult) => void } | null = null;
  let joining: { code: string; promise: Promise<JoinResult>; resolve: (result: JoinResult) => void } | null = null;
  let resuming: ((found: boolean) => void) | null = null;
  let resumePromise: Promise<boolean> | null = null;

  const get = () => useRoom.getState();
  const set = (patch: Partial<RoomState>) => useRoom.setState(patch);

  const clearTimer = (timer: ReturnType<typeof setTimeout> | undefined): undefined => {
    if (timer !== undefined) clearTimeout(timer);
    return undefined;
  };

  const onBody = (body: string) => {
    const incoming = parseRoomIncoming(body);
    if (incoming) onIncoming(incoming);
  };

  /** The socket (`roomTransport.ts`): what to do when it opens or is lost is decided here. */
  const transport = createRoomTransport(env, {
    onPrivate: onBody,
    onTopic: onBody,
    onOpen() {
      const { session } = get();
      if (!session) return;
      transport.subscribeTopic(session.roomId);
      if (get().reconnecting) {
        // The server answers the private subscription with ROOM_JOINED if the room is still hers.
        resumeTimer = clearTimer(resumeTimer);
        resumeTimer = setTimeout(() => end('CLOSED'), RESUME_TIMEOUT_MS);
      }
    },
    onLost: (wasOpen) => connectionLost(wasOpen),
  });

  /** The room's numbered broadcasts, applied in order (`roomSeqGate.ts`). */
  const gate = createSeqGate<Ordered>({
    retryMs: RESYNC_RETRY_MS,
    lastSeq: () => get().session?.lastSeq ?? 0,
    apply: applyLobby,
    requestResync() {
      const { session } = get();
      return session ? transport.publishIfOpen(roomResync(session.roomId), '{}') : false;
    },
  });

  function closeSocket(): void {
    retryTimer = clearTimer(retryTimer);
    gate.reset();
    transport.close();
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
    const update = lobbyUpdate(session, configuring, incoming);
    if (update.clearStartTimer) startTimer = clearTimer(startTimer);
    if (update.clearConfigureTimer) configureTimer = clearTimer(configureTimer);
    set(update.patch);
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

  /** A close that arrives while a create is open: the create is over without a lobby. */
  function settleCreateAfterEnd(): void {
    const current = creating;
    creating = null;
    current?.resolve({ ok: false, error: { code: 'CONNECTION' } });
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
        if (previous && previous.roomId !== payload.roomId) gate.dropHeld();
        set({ session, reconnecting: false, phase: get().phase === 'idle' ? 'lobby' : get().phase });
        transport.subscribeTopic(payload.roomId);
        gate.drain();
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
        gate.receive(incoming, session.lastSeq);
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

  /** The socket closed or never opened. In a lobby it is reopened; anything waiting on it fails. */
  function connectionLost(wasOpen: boolean): void {
    transport.clearPending();
    gate.stopRetrying();
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
      if (transport.status() === 'closed' && get().session) transport.open(true);
    }, delay);
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
      transport.send((c) => c.publish({ destination, body }));
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
      transport.send((c) => c.publish({ destination: ROOM_JOIN, body: joinBody(code) }));
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
      transport.send((c) => c.publish({ destination: roomStart(session.roomId), body: '{}' }));
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
        transport.send(() => undefined);
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
      transport.send((c) => c.publish({ destination: roomConfigure(session.roomId), body: configBody(config) }));
    },
    leave() {
      const { session } = get();
      // Not open: nothing to tell game-service, which closes the room after its grace.
      if (session) transport.publishIfOpen(roomLeave(session.roomId), '{}');
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
