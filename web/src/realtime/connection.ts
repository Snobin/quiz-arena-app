import { Client, type IFrame, type IMessage, type StompConfig, type StompSubscription } from '@stomp/stompjs';
import { session } from '../auth/session.ts';
import {
  INITIAL_LIVE_GAME,
  liveGameStore,
  liveMatchBase,
  liveMatchFor,
  type LiveGameState,
  type LiveMatch,
  type LiveMatchPhase,
  type MatchOutcome,
  type MyAnswer,
  type RematchState,
} from './liveGameStore.ts';
import * as lastResult from './lastResult.ts';
import * as liveMatchId from './liveMatchId.ts';
import {
  ENDPOINT_PATH,
  matchAnswer,
  matchLeave,
  matchRematch,
  matchRematchCancel,
  matchResync,
  matchmakingCancel,
  matchmakingJoin,
  matchTopic,
  parseIncoming,
  USER_PRIVATE_QUEUE,
  type Incoming,
  type MatchMode,
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
 *
 * Results (Story 1.10): MATCH_ENDED (private) is kept on the live match as `ended`, whenever it
 * comes (before or after the last reveal, or after her own forfeit), and in `sessionStorage`
 * (`lastResult.ts`) so `/results` survives a reload. The next MATCH_FOUND clears the stored one.
 *
 * Rematch (Story 1.10 part 2): `requestRematch(matchId)` sends Rematch (or Accept) for the ended
 * match and marks the store's `rematch` as `starting`; REMATCH_REQUESTED makes it `waiting` (hers)
 * or `incoming` (the opponent's); REMATCH_DECLINED, REMATCH_EXPIRED, and a MATCHMAKING_FAILED or
 * SERVER_DRAINING while one is under way revert it to `idle` with a note. The new match arrives
 * as an ordinary MATCH_FOUND, which clears it. `cancelRematch` withdraws a pending request.
 *
 * Rejoin after a reload: the live match id is kept in `sessionStorage` (`liveMatchId.ts`) from
 * MATCH_FOUND until the match settles for her. `rejoinMatch(id)` (called by `/match` when it has
 * an id but no live match) is the reconnect path with no prior state: it subscribes to the topic,
 * sends `resync` (with its retry), buffers topic frames for that match, and builds the live match
 * from the SNAPSHOT (participants, total, `selfParticipantId`) before applying it. NOT_IN_MATCH,
 * or no SNAPSHOT within `REJOIN_TIMEOUT_MS`, marks the rejoin `gone` and clears the stored id.
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
/** A rejoin with no SNAPSHOT within this gives up (the screen goes Home). */
export const REJOIN_TIMEOUT_MS = 10_000;

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
    getAccessToken: () => session.getAccessToken(),
    invalidate: (token) => session.invalidate(token),
    url: () => sameOriginUrl(),
    now: () => Date.now(),
  };
}

export type CancelResult = 'sent' | 'closed' | 'none';

export type Realtime = {
  /** Joins the Quick Match queue, or the Topic Duel queue of `topicId`. */
  joinQuickMatch: (topicId?: string) => void;
  /** Sends an answer to the open question. False when it is not sendable (not open, already answered, socket closed). */
  submitAnswer: (optionIndex: number) => boolean;
  /** Leaves the live match (an immediate forfeit). False when there is no match in play. */
  leaveMatch: () => boolean;
  /**
   * Rejoins `matchId` after a reload (no live state): subscribe, `resync`, and build the live
   * match from the SNAPSHOT. Does nothing when that match is already the live one, or already
   * being rejoined. The store's `rejoin` says how it went.
   */
  rejoinMatch: (matchId: string) => void;
  /**
   * Stops a pending rejoin of `matchId` (she left `/match`): timers, topic and held frames go, the
   * store's `rejoin` is cleared, and the stored id is kept. Does nothing for any other match.
   */
  cancelRejoin: (matchId: string) => void;
  /** 'sent': wait for MATCHMAKING_CANCELLED; 'closed': the attempt is gone, go Home now; 'none': not searching. */
  cancelMatchmaking: () => CancelResult;
  /** Asks for a rematch of the ended `matchId` (or accepts the opponent's). False when one is already under way. */
  requestRematch: (matchId: string) => boolean;
  /** Withdraws her pending rematch request. False when none is pending. */
  cancelRematch: () => boolean;
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
  /** The mode of the queue she last joined, so a cancel names it. */
  let queuedMode: MatchMode = 'QUICK';
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
  /** The match being rejoined after a reload (no live match for it yet), or null. */
  let rejoining: string | null = null;
  let rejoinTimer: ReturnType<typeof setTimeout> | undefined;
  let rejoinRetryTimer: ReturnType<typeof setTimeout> | undefined;

  const set = (patch: Partial<LiveGameState>) => liveGameStore.setState(patch);
  const phase = () => liveGameStore.getState().phase;
  const rematch = () => liveGameStore.getState().rematch;
  /** A rematch sent and not yet settled (no note can be pending on it). */
  const rematchUnderway = (): RematchState | null => {
    const current = rematch();
    return current && (current.state === 'starting' || current.state === 'waiting') ? current : null;
  };
  /** Her participant id in the ended match `matchId`: from the live match, else the stored result. */
  const selfIdFor = (matchId: string): string | null => {
    const current = live();
    if (current?.matchId === matchId) return current.selfParticipantId;
    const stored = lastResult.load();
    return stored?.matchId === matchId ? stored.selfId : null;
  };
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
    // Settled for her: a reload no longer rejoins it.
    liveMatchId.clear();
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
    endRejoin(null);
  }

  /**
   * Ends a rejoin: `gone` (NOT_IN_MATCH, or no SNAPSHOT in time) clears the stored id and tells the
   * screen; `null` just stops it (it succeeded, or a new match replaced it).
   */
  function endRejoin(outcome: 'gone' | null): void {
    const matchId = rejoining;
    rejoinTimer = clearTimer(rejoinTimer);
    rejoinRetryTimer = clearTimer(rejoinRetryTimer);
    if (matchId === null) return;
    rejoining = null;
    awaitingSnapshot = false;
    buffer = [];
    resyncTimer = clearTimer(resyncTimer);
    if (outcome === 'gone') {
      dropTopic();
      // Only this match's id: a failed URL id must not wipe a different match's stored id.
      if (liveMatchId.load()?.matchId === matchId) liveMatchId.clear();
      set({ rejoin: { matchId, state: 'gone' } });
    } else {
      set({ rejoin: null });
    }
  }

  /** The rejoin on an open socket: subscribe to the match topic and ask for a SNAPSHOT. */
  function sendRejoin(): void {
    if (rejoining === null || status !== 'open' || !client) return;
    subscribeTopic(rejoining);
    requestResync();
  }

  /** The socket closed (or failed to open) while rejoining: try again shortly. */
  function retryRejoin(): void {
    rejoinRetryTimer = clearTimer(rejoinRetryTimer);
    if (rejoining === null) return;
    rejoinRetryTimer = setTimeout(() => {
      rejoinRetryTimer = undefined;
      if (rejoining !== null && status === 'closed') open(true);
    }, RETRY_DELAYS_MS[1]);
  }

  /**
   * Asks for a SNAPSHOT on the open socket (after a reconnect or a seq gap). With no SNAPSHOT
   * within `RESYNC_RETRY_MS` (a lost or refused reply), it asks again.
   */
  function requestResync(): void {
    resyncTimer = clearTimer(resyncTimer);
    // A rejoin has no live match yet: it asks about the match being rejoined.
    const matchId = rejoining ?? live()?.matchId;
    if (matchId === undefined || status !== 'open' || !client) return;
    client.publish({ destination: matchResync(matchId), body: '{}' });
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
    if (rejoining !== null && incoming.message.matchId === rejoining) {
      // No live match until the SNAPSHOT: hold its frames (applied after it with seq > refSeq).
      buffer.push(incoming);
      return;
    }
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
        const { payload } = incoming;
        const rejoined = rejoining;
        if (rejoined !== null && incoming.message.matchId === rejoined && payload.selfParticipantId !== null) {
          // A rejoin after a reload: build the live match from the SNAPSHOT, then apply it as a
          // reconnect would (held frames after its refSeq follow).
          const base = liveMatchBase({
            matchId: rejoined,
            participants: payload.participants,
            selfParticipantId: payload.selfParticipantId,
            total: payload.total,
            topic: payload.topic,
          });
          const held = buffer;
          endRejoin(null);
          awaitingSnapshot = true;
          buffer = held;
          liveMatchId.save({ matchId: rejoined });
          set({ phase: 'found', problem: null, live: base });
          applySnapshot(base, payload, incoming.message.refSeq ?? 0, clockOffsetMs);
          return true;
        }
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
      case 'MATCH_ENDED': {
        const current = live();
        const { payload } = incoming;
        if (current && payload.matchId === current.matchId && (incoming.message.matchId ?? payload.matchId) === current.matchId) {
          set({ clockOffsetMs, live: { ...current, ended: payload } });
          // Marked as played by a guest, so after she signs in the same results show without the prompt (Story 2.4).
          lastResult.save({
            matchId: payload.matchId,
            selfId: current.selfParticipantId,
            payload,
            guest: session.store.getState().status !== 'registered',
          });
          // A 1v1 forfeit ends the match before its last question: MATCH_ENDED is then the end
          // of the match for her too (the screen holds on the reveal, then opens the results).
          if (current.outcome === null && current.participants.length === 2 && current.forfeited.length > 0) {
            finish('completed');
          }
        } else {
          set({ clockOffsetMs });
        }
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
        if (code === 'NOT_IN_MATCH' && rejoining !== null && aboutMatch === rejoining) {
          // The match to rejoin is over, or was never hers: the screen opens the results or Home.
          set({ clockOffsetMs });
          endRejoin('gone');
          return true;
        }
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
    // The server drops her requests when her last session closes: nothing is pending any more.
    const asked = rematch();
    if (asked && asked.state !== 'idle') set({ rematch: { matchId: asked.matchId, state: 'idle', note: 'unavailable' } });
    const current = phase();
    if (current === 'searching' || current === 'cancelling') set({ phase: 'failed', problem: { kind: 'connection' } });
  }

  function onIncoming(incoming: Incoming): void {
    const offset = Date.parse(incoming.message.serverTime) - env.now();
    const clockOffsetMs = Number.isFinite(offset) ? offset : liveGameStore.getState().clockOffsetMs;
    if (onMatchMessage(incoming, clockOffsetMs)) return;
    switch (incoming.type) {
      case 'MATCH_FOUND':
        // A new match replaces the last stored result.
        lastResult.clear();
        endRejoin(null);
        liveMatchId.save({ matchId: incoming.payload.matchId });
        set({
          phase: 'found',
          match: incoming.payload,
          problem: null,
          clockOffsetMs,
          live: liveMatchFor(incoming.payload),
          rematch: null,
        });
        subscribeTopic(incoming.payload.matchId);
        return;
      case 'MATCHMAKING_FAILED': {
        const asked = rematchUnderway();
        const gone = incoming.payload.reason === 'TOPIC_UNAVAILABLE';
        if (asked) {
          // The rematch's question set did not come: a note on the results, not a matchmaking problem.
          set({ rematch: { matchId: asked.matchId, state: 'idle', note: gone ? 'topicUnavailable' : 'failed' }, clockOffsetMs });
          return;
        }
        set({ phase: 'failed', problem: { kind: gone ? 'topicUnavailable' : 'matchmaking' }, clockOffsetMs });
        return;
      }
      case 'REMATCH_REQUESTED': {
        const { matchId } = incoming.message;
        const selfId = selfIdFor(matchId);
        if (selfId === null) {
          set({ clockOffsetMs });
          return;
        }
        const { requestedBy, expiresAt } = incoming.payload;
        const current = rematch();
        if (requestedBy === selfId && !(current?.matchId === matchId && current.state === 'starting')) {
          // Her own echo after she cancelled locally (or never asked here): nothing is pending.
          set({ clockOffsetMs });
          return;
        }
        if (requestedBy !== selfId && current?.matchId === matchId && current.state === 'starting') {
          // Both asked at once: her own request settles it (MATCH_FOUND follows).
          set({ clockOffsetMs });
          return;
        }
        set({ clockOffsetMs, rematch: { matchId, state: requestedBy === selfId ? 'waiting' : 'incoming', expiresAt } });
        return;
      }
      case 'REMATCH_DECLINED': {
        const { matchId } = incoming.message;
        if (rematch()?.matchId === matchId) {
          const note = incoming.payload.reason === 'CANCELLED' ? 'cancelled' : 'unavailable';
          set({ clockOffsetMs, rematch: { matchId, state: 'idle', note } });
        } else {
          set({ clockOffsetMs });
        }
        return;
      }
      case 'REMATCH_EXPIRED': {
        const { matchId } = incoming.message;
        const current = rematch();
        if (current?.matchId === matchId && current.state !== 'idle') {
          set({ clockOffsetMs, rematch: { matchId, state: 'idle', note: 'expired' } });
        } else {
          set({ clockOffsetMs });
        }
        return;
      }
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
        const asked = rematchUnderway();
        if (code === 'SERVER_DRAINING' && asked) {
          set({ rematch: { matchId: asked.matchId, state: 'idle', note: 'draining' }, clockOffsetMs });
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
            if (rejoining !== null) {
              rejoinRetryTimer = clearTimer(rejoinRetryTimer);
              sendRejoin();
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
            if (rejoining !== null) {
              retryRejoin();
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
        if (rejoining !== null) {
          retryRejoin();
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
    joinQuickMatch(topicId) {
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
      set({ phase: 'searching', problem: null, rematch: null });
      queuedMode = topicId !== undefined ? 'TOPIC_DUEL' : 'QUICK';
      const mode = queuedMode;
      send((c) => c.publish({ destination: matchmakingJoin(mode), body: topicId !== undefined ? JSON.stringify({ topicId }) : '{}' }));
    },
    requestRematch(matchId) {
      const current = rematch();
      if (current?.matchId === matchId && (current.state === 'starting' || current.state === 'waiting')) return false;
      set({ rematch: { matchId, state: 'starting' } });
      send((c) => c.publish({ destination: matchRematch(matchId), body: '{}' }));
      return true;
    },
    cancelRematch() {
      const current = rematchUnderway();
      if (!current) return false;
      set({ rematch: { matchId: current.matchId, state: 'idle' } });
      if (status === 'open' && client) {
        try {
          client.publish({ destination: matchRematchCancel(current.matchId), body: '{}' });
        } catch {
          // The socket is going: the server drops her request when it closes.
        }
      }
      return true;
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
    rejoinMatch(matchId) {
      const current = live();
      if (current?.matchId === matchId || rejoining === matchId) return;
      if (inPlay(current)) {
        // Another match is in play here: never shown as this one.
        set({ rejoin: { matchId, state: 'gone' } });
        return;
      }
      endRejoin(null);
      rejoining = matchId;
      awaitingSnapshot = true;
      buffer = [];
      set({ rejoin: { matchId, state: 'pending' } });
      rejoinTimer = setTimeout(() => {
        rejoinTimer = undefined;
        endRejoin('gone');
      }, REJOIN_TIMEOUT_MS);
      if (status === 'open') sendRejoin();
      else if (status === 'closed') open(true);
      // 'connecting': onConnect sends it.
    },
    cancelRejoin(matchId) {
      if (rejoining !== matchId) return;
      dropTopic();
      endRejoin(null);
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
        client.publish({ destination: matchmakingCancel(queuedMode), body: '{}' });
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

/** Joins the Quick Match queue, or the Topic Duel queue of `topicId`, connecting first if needed. */
export function joinQuickMatch(topicId?: string): void {
  instance().joinQuickMatch(topicId);
}

/** Answers the open question (Story 1.8). See `Realtime.submitAnswer`. */
export function submitAnswer(optionIndex: number): boolean {
  return instance().submitAnswer(optionIndex);
}

/** Leaves the live match: an immediate forfeit (Story 1.9). See `Realtime.leaveMatch`. */
export function leaveMatch(): boolean {
  return instance().leaveMatch();
}

/** Rejoins a match after a page reload. See `Realtime.rejoinMatch`. */
export function rejoinMatch(matchId: string): void {
  instance().rejoinMatch(matchId);
}

/** Stops a pending rejoin. See `Realtime.cancelRejoin`. */
export function cancelRejoin(matchId: string): void {
  instance().cancelRejoin(matchId);
}

/** Asks for (or accepts) a rematch of the ended match. See `Realtime.requestRematch`. */
export function requestRematch(matchId: string): boolean {
  return instance().requestRematch(matchId);
}

/** Withdraws her pending rematch request. See `Realtime.cancelRematch`. */
export function cancelRematch(): boolean {
  return instance().cancelRematch();
}

/** Cancels the search. See `CancelResult`. */
export function cancelMatchmaking(): CancelResult {
  return instance().cancelMatchmaking();
}

/** Closes the socket and clears the live game (sign-out and account deletion). A later join connects again with the then-current token. */
export function closeRealtime(): void {
  realtime?.reset();
}

/** Test helper: replaces parts of the environment (e.g. the client factory) and resets the module. */
export function configureRealtimeForTests(override: Partial<RealtimeEnv>): void {
  realtime?.reset();
  liveMatchId.clear();
  realtime = null;
  envOverride = override;
}

/** Test helper: closes the socket, resets the store and drops overrides. */
export function resetRealtime(): void {
  realtime?.reset();
  liveMatchId.clear();
  realtime = null;
  envOverride = {};
  liveGameStore.setState(INITIAL_LIVE_GAME, true);
}
