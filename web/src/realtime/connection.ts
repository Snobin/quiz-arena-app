import { Client, type IFrame, type IMessage, type StompConfig, type StompSubscription } from '@stomp/stompjs';
import { guestSession } from '../auth/guestSession.ts';
import {
  INITIAL_LIVE_GAME,
  liveGameStore,
  liveMatchFor,
  type LiveGameState,
  type LiveMatch,
  type LiveMatchPhase,
  type MatchOutcome,
  type MyAnswer,
} from './liveGameStore.ts';
import {
  ENDPOINT_PATH,
  matchAnswer,
  matchLeave,
  matchResync,
  matchmakingCancel,
  matchmakingJoin,
  matchTopic,
  parseIncoming,
  USER_PRIVATE_QUEUE,
  type Incoming,
  type SnapshotPayload,
} from './protocol.ts';

/**
 * The single WebSocket connection (AD-18): the app's only `@stomp/stompjs` client, and the only
 * writer of the live-game store.
 *
 * - Same-origin `ws(s)://<host>/ws`, with the guest token as `Authorization: Bearer` on CONNECT.
 * - Opened lazily by the first join, then kept open. Outside a match a dropped socket is not
 *   reopened until the next join.
 * - A CONNECT refused as `UNAUTHENTICATED` invalidates the token and retries once with a new one.
 * - Private messages (`/user/queue/game`) are parsed and turned into store updates.
 * - On MATCH_FOUND it subscribes to `/topic/match/{matchId}` at once (the server's lead-in covers
 *   this step, so Q1 is never missed) and drops the previous match's subscription. Broadcasts
 *   are applied in `seq` order; one with `seq ≤ lastSeq` is a duplicate and dropped.
 * - `submitAnswer` sends the open question's answer; ANSWER_ACCEPTED locks it (keeping her own
 *   result in 1v1 modes), a rejection clears it silently.
 *
 * Resilience (Story 1.9):
 * - A socket that drops mid-match makes the match `reconnecting` (her 10 s grace starts) and is
 *   reopened with backoff (0.5 / 1 / 2 s…) through `open()`, which fetches a fresh token. On
 *   CONNECT it re-subscribes and sends `resync`; topic frames are buffered until the SNAPSHOT,
 *   which replaces the match state; buffered frames with `seq > refSeq` are then applied in order.
 * - After that, a `seq` gap (`seq > lastSeq + 1`) sends one `resync` and buffers until the next
 *   SNAPSHOT.
 * - If the grace runs out locally first she is treated as forfeited; should the socket come back
 *   afterwards it sends `leave` instead of `resync`.
 * - `leaveMatch` forfeits on purpose: her own PARTICIPANT_FORFEITED (or 3 s without one) ends the
 *   match for her as `left`. MATCH_ABORTED ends it as `aborted`.
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

/** The server's reconnect grace (Story 1.9): her ring counts this down. */
export const GRACE_MS = 10_000;
/** Delays between reconnect attempts; the last repeats. */
export const RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;
/** How long reconnect attempts go on after the drop (long enough to deliver a `leave`). */
export const RETRY_WINDOW_MS = 120_000;
/** A `resync` with no SNAPSHOT within this is sent again. */
export const RESYNC_RETRY_MS = 3_000;
/** Leave: with no reply within this, she goes to the results anyway. */
export const LEAVE_TIMEOUT_MS = 3_000;

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
  /** Leaves the live match (an immediate forfeit). False when there is no match in play. */
  leaveMatch: () => boolean;
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

  // Story 1.9 resilience state.
  /** The socket dropped mid-match: reopening it until a SNAPSHOT (or the local grace) settles it. */
  let reconnecting = false;
  /** Topic frames are held here until the next SNAPSHOT (after a drop, or a seq gap). */
  let awaitingSnapshot = false;
  let buffer: Incoming[] = [];
  /** Send `leave` on the next CONNECT instead of `resync` (gave up locally, or left while offline). */
  let pendingLeave = false;
  /** `leave` sent; waiting for her own PARTICIPANT_FORFEITED. */
  let leaving = false;
  let retries = 0;
  let droppedAt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  let resyncTimer: ReturnType<typeof setTimeout> | undefined;

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

  /** Subscribes to the match topic on the open client; its frames go to `onTopic` only while it is current. */
  function subscribeTopic(matchId: string): void {
    dropTopic();
    if (status !== 'open' || !client) return;
    const attempt = generation;
    const subscription = client.subscribe(matchTopic(matchId), (message) => {
      if (attempt !== generation || topic !== handle) return;
      const incoming = parseIncoming(message.body);
      if (incoming) onTopic(incoming);
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

  /** Whether the match is still being played by her (no outcome yet, not ended). */
  function inPlay(match: LiveMatch | null): match is LiveMatch {
    return match !== null && match.outcome === null && match.phase !== 'ended';
  }

  /** Every participant's score as last seen; hers includes an accepted 1v1 answer to the open question. */
  function scoresOf(match: LiveMatch): MatchOutcome['scores'] {
    const mine = match.myAnswer;
    const openAck =
      mine?.status === 'locked' && mine.result && mine.questionIndex === match.question?.questionIndex && match.reveal?.questionIndex !== mine.questionIndex
        ? mine.result.totalScore
        : null;
    return match.participants.map((p) => ({
      participantId: p.participantId,
      score: p.participantId === match.selfParticipantId && openAck !== null ? openAck : (match.totals[p.participantId] ?? 0),
    }));
  }

  /** Ends the match for her as `kind`. An existing outcome is kept, except that an abort replaces any. */
  function finish(kind: MatchOutcome['kind']): void {
    const current = live();
    if (!current) return;
    if (current.outcome && kind !== 'aborted') return;
    if (current.outcome?.kind === 'aborted') return;
    setLive({ outcome: { kind, scores: scoresOf(current) } });
  }

  function clearTimer(timer: ReturnType<typeof setTimeout> | undefined): undefined {
    if (timer !== undefined) clearTimeout(timer);
    return undefined;
  }

  function resetResilience(): void {
    reconnecting = false;
    awaitingSnapshot = false;
    buffer = [];
    pendingLeave = false;
    leaving = false;
    retries = 0;
    retryTimer = clearTimer(retryTimer);
    giveUpTimer = clearTimer(giveUpTimer);
    leaveTimer = clearTimer(leaveTimer);
    resyncTimer = clearTimer(resyncTimer);
  }

  /**
   * Asks for a SNAPSHOT on the open socket (after a reconnect or a seq gap). With no SNAPSHOT
   * within `RESYNC_RETRY_MS` (a lost or refused reply), it asks again.
   */
  function requestResync(): void {
    resyncTimer = clearTimer(resyncTimer);
    const current = live();
    if (!current || status !== 'open' || !client) return;
    client.publish({ destination: matchResync(current.matchId), body: '{}' });
    resyncTimer = setTimeout(() => {
      resyncTimer = undefined;
      if (awaitingSnapshot && status === 'open' && client) requestResync();
    }, RESYNC_RETRY_MS);
  }

  /**
   * A topic frame: held while a SNAPSHOT is awaited; else a duplicate (`seq ≤ lastSeq`) is
   * dropped, a gap (`seq > lastSeq + 1`) asks for a SNAPSHOT and starts holding frames, and the
   * next frame in sequence is applied.
   */
  function onTopic(incoming: Incoming): void {
    const current = live();
    if (!current || incoming.message.matchId !== current.matchId) return;
    if (awaitingSnapshot) {
      buffer.push(incoming);
      return;
    }
    const { seq } = incoming.message;
    if (seq !== undefined) {
      if (seq <= current.lastSeq) return;
      if (seq > current.lastSeq + 1) {
        awaitingSnapshot = true;
        buffer.push(incoming);
        requestResync();
        return;
      }
    }
    onIncoming(incoming);
  }

  /** The socket dropped mid-match: `reconnecting`, the local grace, and the first retry. */
  function startReconnect(): void {
    reconnecting = true;
    awaitingSnapshot = true;
    buffer = [];
    retries = 0;
    droppedAt = env.now();
    if (leaving) pendingLeave = true;
    setLive({ connection: 'reconnecting', reconnectDeadline: Date.now() + GRACE_MS });
    giveUpTimer = clearTimer(giveUpTimer);
    giveUpTimer = setTimeout(giveUp, GRACE_MS);
    scheduleRetry();
  }

  function scheduleRetry(): void {
    retryTimer = clearTimer(retryTimer);
    if (!reconnecting && !pendingLeave) return;
    if (env.now() - droppedAt > RETRY_WINDOW_MS) {
      reconnecting = false;
      pendingLeave = false;
      return;
    }
    const delay = RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)]!;
    retries++;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (status === 'closed' && (reconnecting || pendingLeave)) open(true);
    }, delay);
  }

  /** Her ring reached 0 while still offline: she has forfeited; tell the server if the socket returns. */
  function giveUp(): void {
    giveUpTimer = undefined;
    if (!reconnecting) return;
    reconnecting = false;
    awaitingSnapshot = false;
    buffer = [];
    pendingLeave = true;
    finish('forfeited');
  }

  /** The SNAPSHOT replaces the match state; held frames after its `refSeq` then apply in order. */
  function applySnapshot(current: LiveMatch, payload: SnapshotPayload, refSeq: number, clockOffsetMs: number): void {
    const open = payload.phase === 'QUESTION_OPEN';
    const lastIndex = payload.total - 1;
    const phase: LiveMatchPhase =
      payload.phase === 'LEAD_IN'
        ? 'lead-in'
        : open
          ? 'open'
          : payload.phase === 'ENDED' || payload.lastReveal?.questionIndex === lastIndex
            ? 'ended'
            : 'revealed';
    const question =
      open && payload.question && payload.startedAt && payload.deadline
        ? {
            questionIndex: payload.questionIndex,
            total: payload.total,
            startedAt: payload.startedAt,
            deadline: payload.deadline,
            question: payload.question,
          }
        : current.question?.questionIndex === payload.questionIndex
          ? current.question
          : null;
    let myAnswer: MyAnswer | null = null;
    if (open && payload.myAnswer) {
      myAnswer = {
        questionIndex: payload.questionIndex,
        optionIndex: payload.myAnswer.pickedIndex,
        status: 'locked',
        result: payload.myAnswer.result,
      };
    } else if (!open && current.myAnswer?.status === 'locked' && current.myAnswer.questionIndex === payload.questionIndex) {
      myAnswer = current.myAnswer;
    }
    reconnecting = false;
    awaitingSnapshot = false;
    retryTimer = clearTimer(retryTimer);
    giveUpTimer = clearTimer(giveUpTimer);
    resyncTimer = clearTimer(resyncTimer);
    set({
      clockOffsetMs,
      live: {
        ...current,
        participants: payload.participants.length > 0 ? payload.participants : current.participants,
        total: payload.total,
        phase,
        question,
        answered: open ? payload.answered : [],
        myAnswer,
        reveal: open ? null : payload.lastReveal,
        totals: Object.fromEntries(payload.scores.map((s) => [s.participantId, s.score])),
        forfeited: payload.scores.filter((s) => s.forfeited).map((s) => s.participantId),
        lastSeq: refSeq,
        connection: 'live',
        reconnectDeadline: null,
      },
    });
    if (payload.youForfeited) finish(leaving ? 'left' : 'forfeited');
    else if (phase === 'ended') finish('completed');
    const held = buffer.sort((a, b) => (a.message.seq ?? 0) - (b.message.seq ?? 0));
    buffer = [];
    for (const frame of held) onTopic(frame);
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
        if (payload.questionIndex >= payload.total - 1) {
          dropTopic();
          finish('completed');
        }
        return true;
      }
      case 'SNAPSHOT': {
        const current = live();
        if (current && incoming.message.matchId === current.matchId) {
          applySnapshot(current, incoming.payload, incoming.message.refSeq ?? current.lastSeq, clockOffsetMs);
        } else {
          set({ clockOffsetMs });
        }
        return true;
      }
      case 'PARTICIPANT_FORFEITED': {
        const current = acceptBroadcast(incoming);
        if (!current) break;
        const { participantId } = incoming.payload;
        set({
          clockOffsetMs,
          live: {
            ...current,
            forfeited: current.forfeited.includes(participantId) ? current.forfeited : [...current.forfeited, participantId],
            lastSeq: incoming.message.seq ?? current.lastSeq,
          },
        });
        if (participantId === current.selfParticipantId) {
          finish(leaving ? 'left' : 'forfeited');
          leaving = false;
          leaveTimer = clearTimer(leaveTimer);
        }
        return true;
      }
      case 'MATCH_ABORTED': {
        const current = acceptBroadcast(incoming);
        if (!current) break;
        set({ clockOffsetMs, live: { ...current, phase: 'ended', lastSeq: incoming.message.seq ?? current.lastSeq } });
        finish('aborted');
        dropTopic();
        resetResilience();
        return true;
      }
      case 'ANSWER_ACCEPTED': {
        const current = live();
        const mine = current?.myAnswer;
        if (current && incoming.message.matchId === current.matchId && mine?.status === 'pending' && mine.questionIndex === incoming.payload.questionIndex) {
          set({
            clockOffsetMs,
            live: { ...current, myAnswer: { ...mine, status: 'locked', result: incoming.payload.result } },
          });
        } else {
          set({ clockOffsetMs });
        }
        return true;
      }
      case 'ERROR': {
        const { code } = incoming.payload;
        if (code !== 'ANSWER_REJECTED' && code !== 'NOT_IN_MATCH') return false;
        const waiting = live();
        const aboutMatch = incoming.payload.matchId ?? incoming.message.matchId;
        if (code === 'NOT_IN_MATCH' && awaitingSnapshot && waiting && aboutMatch === waiting.matchId) {
          // The match is gone (it ended while she was away): apply the frames held after lastSeq,
          // in order, then settle it with what was last seen.
          reconnecting = false;
          awaitingSnapshot = false;
          giveUpTimer = clearTimer(giveUpTimer);
          retryTimer = clearTimer(retryTimer);
          resyncTimer = clearTimer(resyncTimer);
          const held = buffer.sort((a, b) => (a.message.seq ?? 0) - (b.message.seq ?? 0));
          buffer = [];
          set({ clockOffsetMs, live: { ...waiting, connection: 'live', reconnectDeadline: null } });
          for (const frame of held) {
            if ((frame.message.seq ?? 0) > (live()?.lastSeq ?? 0)) onIncoming(frame);
          }
          const settled = live();
          if (settled) {
            // Q1 revealed (the match counts as completed) when a later question opened or a reveal is in.
            const q1Revealed = settled.reveal !== null || (settled.question?.questionIndex ?? 0) > 0;
            finish(q1Revealed ? 'completed' : 'aborted');
            setLive({ phase: 'ended' });
          }
          dropTopic();
          return true;
        }
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
            const current = live();
            if (current && pendingLeave) {
              // She has already forfeited (or chose Leave) while offline: tell the server, nothing more.
              pendingLeave = false;
              reconnecting = false;
              awaitingSnapshot = false;
              buffer = [];
              retryTimer = clearTimer(retryTimer);
              giveUpTimer = clearTimer(giveUpTimer);
              created.publish({ destination: matchLeave(current.matchId), body: '{}' });
            } else if (current && reconnecting) {
              retries = 0;
              retryTimer = clearTimer(retryTimer);
              subscribeTopic(current.matchId);
              requestResync();
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
              // The token was refused: drop it and try once more with a fresh one.
              env.invalidate(token);
              open(false);
              return;
            }
            pending = [];
            if (wasOpen && inPlay(live())) {
              startReconnect();
              return;
            }
            if (reconnecting || pendingLeave) {
              scheduleRetry();
              return;
            }
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
        if (reconnecting || pendingLeave) {
          scheduleRetry();
          return;
        }
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
    resetResilience();
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
      if (live()?.phase === 'ended' || live()?.outcome) {
        const gone = live()!;
        // Gave up offline and the leave has not gone out yet: send it before the join.
        if (pendingLeave) pending.push((c) => c.publish({ destination: matchLeave(gone.matchId), body: '{}' }));
        dropTopic();
        resetResilience();
        set({ live: null });
      }
      set({ phase: 'searching', problem: null });
      send((c) => c.publish({ destination: matchmakingJoin('QUICK'), body: '{}' }));
    },
    submitAnswer(optionIndex) {
      const current = live();
      if (!current || current.phase !== 'open' || current.myAnswer !== null || !current.question) return false;
      if (current.connection === 'reconnecting' || current.outcome !== null || leaving) return false;
      if (current.forfeited.includes(current.selfParticipantId)) return false;
      if (status !== 'open' || !client || awaitingSnapshot) return false;
      // Past the deadline on the server clock: the server would reject it, so don't send.
      const deadline = Date.parse(current.question.deadline);
      if (deadline - (env.now() + liveGameStore.getState().clockOffsetMs) <= 0) return false;
      const { questionIndex } = current.question;
      setLive({ myAnswer: { questionIndex, optionIndex, status: 'pending', result: null } });
      try {
        client.publish({ destination: matchAnswer(current.matchId), body: JSON.stringify({ questionIndex, optionIndex }) });
      } catch {
        setLive({ myAnswer: null });
        return false;
      }
      return true;
    },
    leaveMatch() {
      const current = live();
      if (!inPlay(current)) return false;
      if (leaving) return true;
      leaving = true;
      leaveTimer = clearTimer(leaveTimer);
      leaveTimer = setTimeout(() => {
        leaveTimer = undefined;
        leaving = false;
        finish('left');
      }, LEAVE_TIMEOUT_MS);
      if (status === 'open' && client && !reconnecting) {
        try {
          client.publish({ destination: matchLeave(current.matchId), body: '{}' });
          return true;
        } catch {
          // The socket is going: the leave goes out on the next connect.
        }
      }
      pendingLeave = true;
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

/** Leaves the live match: an immediate forfeit (Story 1.9). See `Realtime.leaveMatch`. */
export function leaveMatch(): boolean {
  return instance().leaveMatch();
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
