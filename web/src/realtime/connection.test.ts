import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL,
  FakeStomp,
  JOIN,
  MATCHMAKING_CANCELLED,
  MATCHMAKING_FAILED,
  SERVER_TIME,
  answerAccepted,
  answerAcceptedWithResult,
  matchAborted,
  matchEnded,
  matchFound,
  participantForfeited,
  questionRevealed,
  questionStarted,
  rematchCancelSend,
  rematchDeclined,
  rematchExpired,
  rematchRequested,
  rematchSend,
  scoreboard,
  serverError,
  snapshot,
} from '../test-utils/realtime.ts';
import { createRealtime, GRACE_MS, LEAVE_TIMEOUT_MS, REJOIN_TIMEOUT_MS, RESYNC_RETRY_MS, sameOriginUrl, type Realtime, type RealtimeEnv } from './connection.ts';
import { session } from '../auth/session.ts';
import * as lastResult from './lastResult.ts';
import * as liveMatchId from './liveMatchId.ts';
import { INITIAL_LIVE_GAME, liveGameStore } from './liveGameStore.ts';
import { matchAnswer, matchLeave, matchResync, matchTopic, USER_PRIVATE_QUEUE } from './protocol.ts';

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

describe('the live match', () => {
  const T0 = Date.parse(SERVER_TIME);

  async function found(name = 'Minnal Bot') {
    await joinAndOpen();
    const message = matchFound({ name, kind: 'BOT' });
    last().deliver(message);
    const { matchId, selfParticipantId, participants } = message.payload;
    const opponent = participants.find((p) => p.participantId !== selfParticipantId)!.participantId;
    return { matchId, self: selfParticipantId, opponent };
  }

  it('MATCH_FOUND subscribes to the match topic at once and starts a lead-in live slice', async () => {
    const { matchId, self, opponent } = await found();
    expect(last().isSubscribed(matchTopic(matchId))).toBe(true);
    expect(state().live).toMatchObject({
      matchId,
      selfParticipantId: self,
      total: 10,
      phase: 'lead-in',
      question: null,
      answered: [],
      myAnswer: null,
      reveal: null,
      totals: { [self]: 0, [opponent]: 0 },
      lastSeq: 0,
    });
  });

  it('a new MATCH_FOUND replaces the slice and moves the subscription', async () => {
    const first = await found();
    last().deliverTopic(first.matchId, questionStarted(first.matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    const second = matchFound({ name: 'Vishnu R', kind: 'GUEST' });
    last().deliver(second);
    expect(last().unsubscribed).toEqual([matchTopic(first.matchId)]);
    expect(last().isSubscribed(matchTopic(first.matchId))).toBe(false);
    expect(last().isSubscribed(matchTopic(second.matchId))).toBe(true);
    expect(state().live).toMatchObject({ matchId: second.matchId, phase: 'lead-in', question: null, lastSeq: 0 });
  });

  it('QUESTION_STARTED opens the question and resets answered, myAnswer and reveal; the clock offset follows serverTime', async () => {
    const { matchId, opponent } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(matchId, scoreboard(matchId, 2, 0, [opponent]));
    realtime.submitAnswer(1);
    last().deliverTopic(matchId, questionRevealed(matchId, { seq: 3, questionIndex: 0, answerIndex: 0, results: [] }));
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 4, questionIndex: 1, startedAt: T0 + 2000, serverTime: T0 + 4000 }));
    expect(state().live).toMatchObject({ phase: 'open', answered: [], myAnswer: null, reveal: null, lastSeq: 4 });
    expect(state().live!.question!.questionIndex).toBe(1);
    expect(state().clockOffsetMs).toBe(4000 + 1500);
  });

  it('drops broadcasts with seq ≤ lastSeq, and those for another match; a gap asks for a SNAPSHOT instead', async () => {
    const { matchId, opponent } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(matchId, scoreboard(matchId, 2, 0, [opponent]));
    last().deliverTopic(matchId, scoreboard(matchId, 2, 0, []));
    last().deliverTopic(matchId, scoreboard(matchId, 1, 0, []));
    expect(state().live!.answered).toEqual([opponent]);
    last().deliverTopic(matchId, scoreboard('another-match', 3, 0, []));
    expect(state().live!.answered).toEqual([opponent]);
    last().deliverTopic(matchId, scoreboard(matchId, 7, 0, []));
    expect(state().live).toMatchObject({ answered: [opponent], lastSeq: 2 });
    expect(last().sentTo(matchResync(matchId))).toBe(1);
  });

  it('submitAnswer: only while open and unanswered; pending → locked on ANSWER_ACCEPTED', async () => {
    const { matchId } = await found();
    expect(realtime.submitAnswer(2)).toBe(false); // lead-in
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 3, startedAt: T0 }));
    expect(realtime.submitAnswer(2)).toBe(true);
    expect(state().live!.myAnswer).toEqual({ questionIndex: 3, optionIndex: 2, status: 'pending', result: null });
    expect(last().bodiesTo(matchAnswer(matchId))).toEqual([{ questionIndex: 3, optionIndex: 2 }]);
    expect(realtime.submitAnswer(1)).toBe(false);
    // An ack for another question changes nothing.
    last().deliver(answerAccepted(matchId, 2));
    expect(state().live!.myAnswer!.status).toBe('pending');
    last().deliver(answerAccepted(matchId, 3));
    expect(state().live!.myAnswer).toEqual({ questionIndex: 3, optionIndex: 2, status: 'locked', result: null });
    expect(realtime.submitAnswer(0)).toBe(false);
    expect(last().sentTo(matchAnswer(matchId))).toBe(1);
    expect(state().phase).toBe('found');
  });

  it('a 1v1 ANSWER_ACCEPTED keeps her own result on the locked answer; the reveal leaves it', async () => {
    const { matchId, opponent } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    realtime.submitAnswer(0);
    const result = { correct: true, points: 750, answerIndex: 0, totalScore: 750 };
    last().deliver(answerAcceptedWithResult(matchId, 0, result));
    expect(state().live!.myAnswer).toEqual({ questionIndex: 0, optionIndex: 0, status: 'locked', result });
    // An unsolicited ack (nothing pending) is ignored.
    last().deliver(answerAcceptedWithResult(matchId, 0, { ...result, points: 1 }));
    expect(state().live!.myAnswer!.result).toEqual(result);
    last().deliverTopic(
      matchId,
      questionRevealed(matchId, {
        seq: 2,
        questionIndex: 0,
        answerIndex: 0,
        results: [
          { participantId: state().live!.selfParticipantId, pickedIndex: 0, correct: true, points: 750, totalScore: 750 },
          { participantId: opponent, pickedIndex: 1, correct: false, points: 0, totalScore: 0 },
        ],
      }),
    );
    expect(state().live!.myAnswer!.result).toEqual(result);
    // The next question starts with no answer and no result.
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 3, questionIndex: 1, startedAt: T0 + 17_000 }));
    expect(state().live!.myAnswer).toBeNull();
  });

  it('ANSWER_REJECTED or NOT_IN_MATCH while pending clears the answer silently, never a matchmaking failure', async () => {
    const { matchId } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    realtime.submitAnswer(1);
    last().deliver(serverError('ANSWER_REJECTED', matchId));
    expect(state().live!.myAnswer).toBeNull();
    expect(state()).toMatchObject({ phase: 'found', problem: null });
    realtime.submitAnswer(2);
    last().deliver(serverError('NOT_IN_MATCH', matchId));
    expect(state().live!.myAnswer).toBeNull();
    expect(state().phase).toBe('found');
    // A rejection after the lock leaves it locked.
    realtime.submitAnswer(3);
    last().deliver(answerAccepted(matchId, 0));
    last().deliver(serverError('ANSWER_REJECTED', matchId));
    expect(state().live!.myAnswer!.status).toBe('locked');
  });

  it('a rejection with no pending answer, or for another match, takes the ordinary error path', async () => {
    const { matchId } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    // No pending answer: not claimed.
    last().deliver(serverError('NOT_IN_MATCH', 'some-other-match'));
    expect(state().problem).toEqual({ kind: 'rejected', code: 'NOT_IN_MATCH' });
    // Pending, but the error names another match: the pending answer stays.
    realtime.submitAnswer(1);
    last().deliver(serverError('ANSWER_REJECTED', 'an-earlier-match'));
    expect(state().live!.myAnswer).toEqual({ questionIndex: 0, optionIndex: 1, status: 'pending', result: null });
    expect(realtime.submitAnswer(2)).toBe(false);
    expect(last().sentTo(matchAnswer(matchId))).toBe(1);
    // Pending, no matchId on the error: claimed.
    last().deliver({ type: 'ERROR', serverTime: SERVER_TIME, payload: { code: 'ANSWER_REJECTED' } });
    expect(state().live!.myAnswer).toBeNull();
  });

  it('submitAnswer: a throwing publish clears the answer; nothing is sent past the deadline', async () => {
    const { matchId } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    const client = last();
    const publish = client.publish.bind(client);
    client.publish = () => {
      throw new Error('socket gone');
    };
    expect(realtime.submitAnswer(1)).toBe(false);
    expect(state().live!.myAnswer).toBeNull();
    client.publish = publish;
    // The server clock now reads past the deadline (offset from the next message's serverTime).
    last().deliverTopic(matchId, scoreboard(matchId, 2, 0, [], new Date(T0 + 15_000).toISOString()));
    expect(realtime.submitAnswer(1)).toBe(false);
    expect(state().live!.myAnswer).toBeNull();
    expect(last().sentTo(matchAnswer(matchId))).toBe(0);
  });

  it('the last reveal drops the topic but keeps the slice; joining again clears it', async () => {
    const { matchId, self } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 9, startedAt: T0 }));
    last().deliverTopic(
      matchId,
      questionRevealed(matchId, { seq: 2, questionIndex: 9, answerIndex: 0, results: [{ participantId: self, pickedIndex: 0, correct: true, points: 500, totalScore: 500 }] }),
    );
    expect(last().isSubscribed(matchTopic(matchId))).toBe(false);
    expect(state().live!.phase).toBe('ended');
    realtime.joinQuickMatch();
    expect(state().live).toBeNull();
    expect(last().sentTo(JOIN)).toBe(2);
  });

  it('joining again keeps a match still in play (for "Back to your match")', async () => {
    const { matchId } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 2, startedAt: T0 }));
    realtime.joinQuickMatch();
    expect(state().live!.matchId).toBe(matchId);
    expect(last().isSubscribed(matchTopic(matchId))).toBe(true);
  });

  it('QUESTION_REVEALED stores the payload and totals; the last index ends the match', async () => {
    const { matchId, self, opponent } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(
      matchId,
      questionRevealed(matchId, {
        seq: 2,
        questionIndex: 0,
        answerIndex: 0,
        results: [
          { participantId: self, pickedIndex: 0, correct: true, points: 800, totalScore: 800 },
          { participantId: opponent, pickedIndex: null, correct: false, points: 0, totalScore: 0 },
        ],
      }),
    );
    expect(state().live).toMatchObject({ phase: 'revealed', totals: { [self]: 800, [opponent]: 0 }, lastSeq: 2 });
    expect(state().live!.reveal!.attribution).toBe('Kerala PSC LDC 2019');
    expect(realtime.submitAnswer(1)).toBe(false);

    last().deliverTopic(matchId, questionStarted(matchId, { seq: 3, questionIndex: 9, startedAt: T0 }));
    last().deliverTopic(
      matchId,
      questionRevealed(matchId, {
        seq: 4,
        questionIndex: 9,
        answerIndex: 1,
        results: [{ participantId: self, pickedIndex: 1, correct: true, points: 600, totalScore: 1400 }],
      }),
    );
    expect(state().live).toMatchObject({ phase: 'ended', totals: { [self]: 1400, [opponent]: 0 } });
  });

  it('a stale subscription delivers nothing after reset', async () => {
    const { matchId } = await found();
    const client = last();
    realtime.reset();
    expect(client.unsubscribed).toEqual([matchTopic(matchId)]);
    expect(state().live).toBeNull();
  });
});

describe('reconnect, forfeit and leave (Story 1.9)', () => {
  const T0 = Date.parse(SERVER_TIME);
  const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    tokens = ['token-1', 'token-2', 'token-3', 'token-4', 'token-5'];
    // A fresh token per CONNECT, as the guest session would mint after the old one expired.
    env.getAccessToken = vi.fn(async () => tokens.shift() ?? 'token-x');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function inMatch() {
    realtime.joinQuickMatch();
    await tick();
    last().open();
    const message = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    last().deliver(message);
    const { matchId, selfParticipantId: self, participants } = message.payload;
    const opponent = participants.find((p) => p.participantId !== self)!.participantId;
    return { matchId, self, opponent, participants };
  }

  it('a drop mid-match reconnects with backoff and a fresh token, resyncs, and the SNAPSHOT restores her answer', async () => {
    const { matchId, self, opponent, participants } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(matchId, questionRevealed(matchId, { seq: 2, questionIndex: 0, answerIndex: 0, results: [
      { participantId: self, pickedIndex: 0, correct: true, points: 900, totalScore: 900 },
      { participantId: opponent, pickedIndex: 1, correct: false, points: 0, totalScore: 0 },
    ] }));
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 3, questionIndex: 1, startedAt: T0 }));
    realtime.submitAnswer(1);
    last().drop();

    expect(state().live).toMatchObject({ connection: 'reconnecting', outcome: null });
    expect(state().live!.reconnectDeadline).toBeGreaterThan(Date.now() + GRACE_MS - 100);
    expect(realtime.submitAnswer(2)).toBe(false);
    expect(clients).toHaveLength(1);
    await tick(499);
    expect(clients).toHaveLength(1);
    await tick(1);
    expect(clients).toHaveLength(2);
    // The first retry fails; the next waits 1 s.
    last().drop();
    await tick(999);
    expect(clients).toHaveLength(2);
    await tick(1);
    expect(clients).toHaveLength(3);
    expect(last().authorization).toBe('Bearer token-3');

    last().open();
    expect(last().isSubscribed(USER_PRIVATE_QUEUE)).toBe(true);
    expect(last().isSubscribed(matchTopic(matchId))).toBe(true);
    expect(last().sentTo(matchResync(matchId))).toBe(1);
    expect(last().sentTo(matchLeave(matchId))).toBe(0);

    // Out of order: 12 and 13 arrive before the SNAPSHOT at 12; 12 is dropped, 13 applied after it.
    last().deliverTopic(matchId, scoreboard(matchId, 13, 1, [self, opponent]));
    last().deliverTopic(matchId, scoreboard(matchId, 12, 1, [self]));
    expect(state().live!.lastSeq).toBe(3);
    last().deliver(
      snapshot(matchId, {
        refSeq: 12,
        questionIndex: 1,
        answered: [self],
        scores: [{ participantId: self, score: 900 }, { participantId: opponent, score: 0 }],
        participants,
        myAnswer: { pickedIndex: 1, correct: true, points: 750, answerIndex: 1, totalScore: 1650 },
      }),
    );
    expect(state().live).toMatchObject({
      connection: 'live',
      reconnectDeadline: null,
      phase: 'open',
      lastSeq: 13,
      answered: [self, opponent],
      totals: { [self]: 900, [opponent]: 0 },
      myAnswer: {
        questionIndex: 1,
        optionIndex: 1,
        status: 'locked',
        result: { correct: true, points: 750, answerIndex: 1, totalScore: 1650 },
      },
      outcome: null,
    });
    expect(state().live!.question!.questionIndex).toBe(1);
    // The local grace was cancelled: nothing happens when it would have run out.
    await tick(GRACE_MS);
    expect(state().live!.outcome).toBeNull();
    expect(clients).toHaveLength(3);
  });

  it('a seq gap sends one resync, holds frames until the SNAPSHOT, then applies those after refSeq', async () => {
    const { matchId, self, opponent, participants } = await inMatch();
    for (let seq = 1; seq <= 7; seq++) {
      last().deliverTopic(matchId, seq === 1
        ? questionStarted(matchId, { seq, questionIndex: 0, startedAt: T0 })
        : scoreboard(matchId, seq, 0, []));
    }
    last().deliverTopic(matchId, scoreboard(matchId, 9, 0, [opponent]));
    last().deliverTopic(matchId, scoreboard(matchId, 10, 0, [opponent, self]));
    expect(last().sentTo(matchResync(matchId))).toBe(1);
    expect(state().live!.lastSeq).toBe(7);
    last().deliver(snapshot(matchId, {
      refSeq: 9,
      answered: [opponent],
      scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
      participants,
    }));
    expect(state().live).toMatchObject({ lastSeq: 10, answered: [opponent, self] });
    expect(last().sentTo(matchResync(matchId))).toBe(1);
  });

  it('when her ring reaches 0 offline she has forfeited; when the socket returns it sends leave, not resync', async () => {
    const { matchId, self, opponent } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(matchId, questionRevealed(matchId, { seq: 2, questionIndex: 0, answerIndex: 0, results: [
      { participantId: self, pickedIndex: 0, correct: true, points: 700, totalScore: 700 },
      { participantId: opponent, correct: false, points: 0, totalScore: 0 },
    ] }));
    last().drop();
    // Every attempt fails until the grace is over.
    for (let elapsed = 0; elapsed < GRACE_MS; elapsed += 500) {
      await tick(500);
      if (last().activations > 0 && !last().connected && state().live!.outcome === null) last().drop();
    }
    expect(state().live!.outcome).toEqual({
      kind: 'forfeited',
      scores: [{ participantId: self, score: 700 }, { participantId: opponent, score: 0 }],
    });
    await tick(2_000);
    last().open();
    expect(last().sentTo(matchLeave(matchId))).toBe(1);
    expect(last().sentTo(matchResync(matchId))).toBe(0);
    expect(last().isSubscribed(matchTopic(matchId))).toBe(false);
  });

  it('a SNAPSHOT saying she forfeited ends the match for her', async () => {
    const { matchId, self, opponent, participants } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().drop();
    await tick(500);
    last().open();
    last().deliver(snapshot(matchId, {
      refSeq: 4,
      phase: 'REVEAL',
      scores: [{ participantId: self, score: 0, forfeited: true }, { participantId: opponent, score: 800 }],
      participants,
      youForfeited: true,
    }));
    expect(state().live).toMatchObject({ forfeited: [self], outcome: { kind: 'forfeited' }, connection: 'live' });
  });

  it('leaveMatch sends leave; her own PARTICIPANT_FORFEITED ends it as left with her earned score', async () => {
    const { matchId, self, opponent } = await inMatch();
    expect(realtime.leaveMatch()).toBe(true); // the lead-in is in play
    expect(last().sentTo(matchLeave(matchId))).toBe(1);
    expect(realtime.leaveMatch()).toBe(true);
    expect(last().sentTo(matchLeave(matchId))).toBe(1);
    last().deliverTopic(matchId, participantForfeited(matchId, 1, self));
    expect(state().live!.outcome).toEqual({
      kind: 'left',
      scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
    });
    expect(realtime.leaveMatch()).toBe(false);
    // Before the first reveal the abort follows, and wins.
    last().deliverTopic(matchId, matchAborted(matchId, 2));
    expect(state().live).toMatchObject({ phase: 'ended', outcome: { kind: 'aborted' } });
    expect(last().isSubscribed(matchTopic(matchId))).toBe(false);
  });

  it('a leave with no reply within 3 s ends it as left anyway', async () => {
    const { matchId } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    realtime.leaveMatch();
    expect(realtime.submitAnswer(0)).toBe(false);
    await tick(LEAVE_TIMEOUT_MS - 1);
    expect(state().live!.outcome).toBeNull();
    await tick(1);
    expect(state().live!.outcome!.kind).toBe('left');
  });

  it('an opponent forfeit is recorded and the match goes on', async () => {
    const { matchId, opponent } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(matchId, participantForfeited(matchId, 2, opponent));
    expect(state().live).toMatchObject({ forfeited: [opponent], outcome: null, lastSeq: 2 });
    expect(realtime.submitAnswer(0)).toBe(true);
  });

  it('MATCH_ABORTED ends it as aborted; a drop after the end does not reconnect', async () => {
    const { matchId } = await inMatch();
    last().deliverTopic(matchId, matchAborted(matchId, 1, 'ERROR'));
    expect(state().live).toMatchObject({ phase: 'ended', outcome: { kind: 'aborted' } });
    last().drop();
    await tick(5_000);
    expect(clients).toHaveLength(1);
  });

  it('the last reveal marks the match completed with the final totals', async () => {
    const { matchId, self, opponent } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 9, startedAt: T0 }));
    last().deliverTopic(matchId, questionRevealed(matchId, { seq: 2, questionIndex: 9, answerIndex: 0, results: [
      { participantId: self, pickedIndex: 0, correct: true, points: 600, totalScore: 5_000 },
      { participantId: opponent, correct: false, points: 0, totalScore: 4_000 },
    ] }));
    expect(state().live!.outcome).toEqual({
      kind: 'completed',
      scores: [{ participantId: self, score: 5_000 }, { participantId: opponent, score: 4_000 }],
    });
  });

  it('leaveMatch while reconnecting: the next socket sends leave, not resync, and does not subscribe the topic', async () => {
    const { matchId } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().drop();
    expect(realtime.leaveMatch()).toBe(true);
    await tick(500);
    last().open();
    expect(last().sentTo(matchLeave(matchId))).toBe(1);
    expect(last().sentTo(matchResync(matchId))).toBe(0);
    expect(last().isSubscribed(matchTopic(matchId))).toBe(false);
  });

  it('leaving with an accepted 1v1 answer to the open question keeps its totalScore as her score', async () => {
    const { matchId, self } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    realtime.submitAnswer(0);
    last().deliver(answerAcceptedWithResult(matchId, 0, { correct: true, points: 870, answerIndex: 0, totalScore: 870 }));
    realtime.leaveMatch();
    last().deliverTopic(matchId, participantForfeited(matchId, 2, self));
    expect(state().live!.outcome!.kind).toBe('left');
    expect(state().live!.outcome!.scores.find((r) => r.participantId === self)!.score).toBe(870);
  });

  it('NOT_IN_MATCH after Q1 was revealed settles as completed and ended', async () => {
    const { matchId, self, opponent } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(matchId, questionRevealed(matchId, { seq: 2, questionIndex: 0, answerIndex: 0, results: [
      { participantId: self, pickedIndex: 0, correct: true, points: 700, totalScore: 700 },
      { participantId: opponent, correct: false, points: 0, totalScore: 0 },
    ] }));
    last().drop();
    await tick(500);
    last().open();
    last().deliver(serverError('NOT_IN_MATCH', matchId));
    expect(state().live).toMatchObject({ phase: 'ended', connection: 'live', outcome: { kind: 'completed' } });
    expect(state().live!.outcome!.scores.find((r) => r.participantId === self)!.score).toBe(700);
  });

  it('NOT_IN_MATCH first replays the held frames after lastSeq in order (a held final reveal counts)', async () => {
    const { matchId, self, opponent } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 9, startedAt: T0 }));
    last().drop();
    await tick(500);
    last().open();
    last().deliverTopic(matchId, questionRevealed(matchId, { seq: 3, questionIndex: 9, answerIndex: 0, results: [
      { participantId: self, pickedIndex: 0, correct: true, points: 600, totalScore: 6_000 },
      { participantId: opponent, correct: false, points: 0, totalScore: 5_000 },
    ] }));
    last().deliverTopic(matchId, scoreboard(matchId, 2, 9, [self]));
    last().deliverTopic(matchId, scoreboard(matchId, 1, 9, []));
    last().deliver(serverError('NOT_IN_MATCH', matchId));
    expect(state().live).toMatchObject({
      phase: 'ended',
      lastSeq: 3,
      answered: [self],
      totals: { [self]: 6_000, [opponent]: 5_000 },
      outcome: { kind: 'completed', scores: [{ participantId: self, score: 6_000 }, { participantId: opponent, score: 5_000 }] },
    });
  });

  it('a resync with no SNAPSHOT is sent again every 3 s until one arrives', async () => {
    const { matchId, self, opponent, participants } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(matchId, scoreboard(matchId, 3, 0, [opponent]));
    expect(last().sentTo(matchResync(matchId))).toBe(1);
    await tick(RESYNC_RETRY_MS - 1);
    expect(last().sentTo(matchResync(matchId))).toBe(1);
    await tick(1);
    expect(last().sentTo(matchResync(matchId))).toBe(2);
    await tick(RESYNC_RETRY_MS);
    expect(last().sentTo(matchResync(matchId))).toBe(3);
    last().deliver(snapshot(matchId, {
      refSeq: 2,
      scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
      participants,
    }));
    expect(state().live).toMatchObject({ lastSeq: 3, answered: [opponent] });
    await tick(RESYNC_RETRY_MS * 2);
    expect(last().sentTo(matchResync(matchId))).toBe(3);
  });

  it('Quick Match after a local give-up sends the pending leave before the join', async () => {
    const { matchId } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().drop();
    for (let elapsed = 0; elapsed < GRACE_MS; elapsed += 500) {
      await tick(500);
      if (last().activations > 0 && !last().connected && state().live!.outcome === null) last().drop();
    }
    expect(state().live!.outcome!.kind).toBe('forfeited');
    realtime.joinQuickMatch();
    await tick(2_000);
    last().open();
    expect(last().published.map((p) => p.destination)).toEqual([matchLeave(matchId), JOIN]);
    expect(state().live).toBeNull();
  });

  it('NOT_IN_MATCH in reply to a resync settles a match that ended while she was away', async () => {
    const { matchId } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().drop();
    await tick(500);
    last().open();
    last().deliver(serverError('NOT_IN_MATCH', matchId));
    expect(state().live).toMatchObject({ connection: 'live', phase: 'ended', outcome: { kind: 'aborted' } });
    expect(state().phase).toBe('found');
  });
});

describe('MATCH_ENDED (Story 1.10)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  async function inMatch() {
    await joinAndOpen();
    const message = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    last().deliver(message);
    const { matchId, selfParticipantId: self, participants } = message.payload;
    const opponent = participants.find((p) => p.participantId !== self)!.participantId;
    return { matchId, self, opponent };
  }

  function ended(matchId: string, self: string, opponent: string, count = 2) {
    const answers = Array.from({ length: count }, () => ({ pickedIndex: 0, correct: true, responseMs: 3000, points: 900 }));
    return matchEnded(matchId, {
      participants: [
        { participantId: self, displayName: 'Guest 4821', kind: 'GUEST', score: 900 * count, correctCount: count, placement: 1 },
        { participantId: opponent, displayName: 'Minnal Bot', kind: 'BOT', score: 0, correctCount: 0, placement: 2 },
      ],
      breakdown: { [self]: answers, [opponent]: answers.map(() => ({ correct: false, points: 0 })) },
    });
  }

  it('is kept on the live match and in sessionStorage, whether before or after the last reveal', async () => {
    const { matchId, self, opponent } = await inMatch();
    const message = ended(matchId, self, opponent);
    last().deliver(message);
    expect(state().live!.ended).toEqual(expect.objectContaining({ matchId, questionSource: 'BANK' }));
    expect(state().live!.ended!.breakdown[1]!.answers[0]).toEqual({ pickedIndex: null, correct: false, responseMs: null, points: 0 });
    expect(state().live!.outcome).toBeNull();
    const stored = lastResult.load();
    // Played as a guest (the session was not registered): marked so the prompt can be rebuilt after a reload.
    expect(stored).toEqual({ matchId, selfId: self, payload: state().live!.ended, guest: true, endedAt: expect.any(Number), succeeded: null });
  });

  it('ROOM_SUCCEEDED for the ended match is kept in the store and with the stored result, from the queue or the topic (Story 5.6)', async () => {
    const { matchId, self, opponent } = await inMatch();
    last().deliver(ended(matchId, self, opponent));
    const succeeded = (extra: Record<string, unknown> = {}) => ({
      type: 'ROOM_SUCCEEDED',
      matchId,
      roomId: 'room-1',
      serverTime: SERVER_TIME,
      payload: { code: 'K7M2QX', hostDisplayName: 'Rajeev', source: { type: 'BANK', topicId: 't1' }, questionCount: 10 },
      ...extra,
    });
    // Another match's notice, and a malformed one, change nothing.
    last().deliver(succeeded({ matchId: 'someone-else' }));
    last().deliver(succeeded({ payload: { code: 7 } }));
    expect(state().succeeded).toBeNull();
    last().deliverTopic(matchId, succeeded());
    expect(state().succeeded).toEqual({ matchId, payload: expect.objectContaining({ code: 'K7M2QX', hostDisplayName: 'Rajeev' }) });
    expect(lastResult.load()?.succeeded).toMatchObject({ code: 'K7M2QX', questionCount: 10 });
    // The private copy is the same notice: one value, no change of meaning.
    last().deliver(succeeded());
    expect(state().succeeded?.payload.code).toBe('K7M2QX');
  });

  it('marks the stored result as a registered player’s own when she was signed in at MATCH_ENDED', async () => {
    session.store.setState({ status: 'registered', name: 'Anju', signedOut: false });
    try {
      const { matchId, self, opponent } = await inMatch();
      last().deliver(ended(matchId, self, opponent));
      expect(lastResult.load()?.guest).toBe(false);
    } finally {
      session.reset();
    }
  });

  it('arrives after her own forfeit and still lands (the minimal results upgrade in place)', async () => {
    const { matchId, self, opponent } = await inMatch();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: Date.parse(SERVER_TIME) }));
    realtime.leaveMatch();
    last().deliverTopic(matchId, participantForfeited(matchId, 2, self));
    expect(state().live!.outcome!.kind).toBe('left');
    last().deliver(ended(matchId, self, opponent, 1));
    expect(state().live!.ended!.matchId).toBe(matchId);
    expect(state().live!.outcome!.kind).toBe('left');
  });

  it('for another match it is ignored', async () => {
    const { self, opponent } = await inMatch();
    last().deliver(ended('another-match', self, opponent));
    expect(state().live!.ended).toBeNull();
    expect(lastResult.load()).toBeNull();
  });

  it('a malformed MATCH_ENDED is ignored', async () => {
    const { matchId, self, opponent } = await inMatch();
    const message = ended(matchId, self, opponent);
    message.payload.breakdown[0]!.answers.pop();
    last().deliver(message);
    expect(state().live!.ended).toBeNull();
  });

  it('the next MATCH_FOUND clears the stored result', async () => {
    const { matchId, self, opponent } = await inMatch();
    last().deliver(ended(matchId, self, opponent));
    expect(lastResult.load()).not.toBeNull();
    realtime.joinQuickMatch();
    last().deliver(matchFound({ name: 'Minnal Bot', kind: 'BOT' }));
    expect(lastResult.load()).toBeNull();
    expect(state().live!.ended).toBeNull();
  });
});

describe('rematch (Story 1.10 part 2)', () => {
  const EXPIRES = '2026-11-12T10:16:30.123Z';

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  async function ended() {
    await joinAndOpen();
    const found = matchFound({ name: 'Vishnu R', kind: 'GUEST' });
    last().deliver(found);
    const { matchId, selfParticipantId: self, participants } = found.payload;
    const opponent = participants.find((p) => p.participantId !== self)!.participantId;
    return { matchId, self, opponent };
  }

  it('Rematch sends to the ended match and starts; her own REMATCH_REQUESTED makes it waiting', async () => {
    const { matchId, self } = await ended();
    expect(realtime.requestRematch(matchId)).toBe(true);
    expect(last().sentTo(rematchSend(matchId))).toBe(1);
    expect(state().rematch).toEqual({ matchId, state: 'starting' });
    expect(realtime.requestRematch(matchId)).toBe(false);
    last().deliver(rematchRequested(matchId, self, EXPIRES));
    expect(state().rematch).toEqual({ matchId, state: 'waiting', expiresAt: EXPIRES });
  });

  it("the opponent's request makes it incoming, and accepting sends a rematch too", async () => {
    const { matchId, opponent } = await ended();
    last().deliver(rematchRequested(matchId, opponent, EXPIRES));
    expect(state().rematch).toEqual({ matchId, state: 'incoming', expiresAt: EXPIRES });
    expect(realtime.requestRematch(matchId)).toBe(true);
    expect(state().rematch!.state).toBe('starting');
    expect(last().sentTo(rematchSend(matchId))).toBe(1);
  });

  it("while starting, a crossing request from the opponent keeps it starting; MATCH_FOUND clears it", async () => {
    const { matchId, opponent } = await ended();
    realtime.requestRematch(matchId);
    last().deliver(rematchRequested(matchId, opponent, EXPIRES));
    expect(state().rematch!.state).toBe('starting');
    const next = matchFound({ name: 'Vishnu R', kind: 'GUEST' });
    last().deliver(next);
    expect(state().rematch).toBeNull();
    expect(state().live!.matchId).toBe(next.payload.matchId);
    expect(last().isSubscribed(matchTopic(next.payload.matchId))).toBe(true);
  });

  it('declined, expired, a failed set and draining each revert it with their note', async () => {
    const { matchId, self } = await ended();
    realtime.requestRematch(matchId);
    last().deliver(rematchDeclined(matchId, 'UNAVAILABLE'));
    expect(state().rematch).toEqual({ matchId, state: 'idle', note: 'unavailable' });

    realtime.requestRematch(matchId);
    last().deliver(rematchRequested(matchId, self, EXPIRES));
    last().deliver(rematchExpired(matchId));
    expect(state().rematch).toEqual({ matchId, state: 'idle', note: 'expired' });

    realtime.requestRematch(matchId);
    last().deliver(MATCHMAKING_FAILED);
    expect(state().rematch).toEqual({ matchId, state: 'idle', note: 'failed' });
    expect(state().phase).toBe('found');
    expect(state().problem).toBeNull();

    realtime.requestRematch(matchId);
    last().deliver(serverError('SERVER_DRAINING'));
    expect(state().rematch).toEqual({ matchId, state: 'idle', note: 'draining' });
    expect(state().problem).toBeNull();
  });

  it("the opponent's cancel reverts an incoming request with the cancelled note", async () => {
    const { matchId, opponent } = await ended();
    last().deliver(rematchRequested(matchId, opponent, EXPIRES));
    last().deliver(rematchDeclined(matchId, 'CANCELLED'));
    expect(state().rematch).toEqual({ matchId, state: 'idle', note: 'cancelled' });
  });

  it('cancel withdraws a pending request; with nothing pending it sends nothing', async () => {
    const { matchId, self } = await ended();
    expect(realtime.cancelRematch()).toBe(false);
    realtime.requestRematch(matchId);
    last().deliver(rematchRequested(matchId, self, EXPIRES));
    expect(realtime.cancelRematch()).toBe(true);
    expect(last().sentTo(rematchCancelSend(matchId))).toBe(1);
    expect(state().rematch).toEqual({ matchId, state: 'idle' });
    expect(realtime.cancelRematch()).toBe(false);
  });

  it('her own echo arriving after she cancelled locally is ignored', async () => {
    const { matchId, self } = await ended();
    realtime.requestRematch(matchId);
    expect(realtime.cancelRematch()).toBe(true);
    last().deliver(rematchRequested(matchId, self, EXPIRES));
    expect(state().rematch).toEqual({ matchId, state: 'idle' });
  });

  it('rematch messages about another match are ignored', async () => {
    const { matchId, opponent } = await ended();
    last().deliver(rematchRequested('another-match', opponent, EXPIRES));
    expect(state().rematch).toBeNull();
    realtime.requestRematch(matchId);
    last().deliver(rematchDeclined('another-match', 'UNAVAILABLE'));
    last().deliver(rematchExpired('another-match'));
    expect(state().rematch!.state).toBe('starting');
  });

  it('after a reload the stored result says who she is, and Rematch opens the socket', async () => {
    const { matchId, self } = await ended();
    lastResult.save({
      guest: true,
      matchId,
      selfId: self,
      payload: {
        matchId,
        mode: 'QUICK',
        questionSource: 'BANK',
        participants: [{ participantId: self, displayName: 'Guest', kind: 'GUEST', score: 0, correctCount: 0, forfeited: false, placement: 1 }],
        questions: [],
        breakdown: [{ participantId: self, answers: [] }],
      },
    });
    realtime.reset();
    realtime = createRealtime(env);
    realtime.requestRematch(matchId);
    await flush();
    last().open();
    expect(last().sentTo(rematchSend(matchId))).toBe(1);
    last().deliver(rematchRequested(matchId, self, EXPIRES));
    expect(state().rematch!.state).toBe('waiting');
  });

  it('a socket lost before it settles reverts it as unavailable', async () => {
    const { matchId, self } = await ended();
    // The match is over for her: a drop is not a reconnect.
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: Date.parse(SERVER_TIME) }));
    realtime.leaveMatch();
    last().deliverTopic(matchId, participantForfeited(matchId, 2, self));
    realtime.requestRematch(matchId);
    last().deliver(rematchRequested(matchId, self, EXPIRES));
    last().drop();
    expect(state().rematch).toEqual({ matchId, state: 'idle', note: 'unavailable' });
  });

  it('a new search clears it', async () => {
    const { matchId } = await ended();
    realtime.requestRematch(matchId);
    realtime.joinQuickMatch();
    expect(state().rematch).toBeNull();
  });
});

describe('rejoin after a reload', () => {
  const T0 = Date.parse(SERVER_TIME);
  const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    window.sessionStorage.clear();
    tokens = ['token-1', 'token-2', 'token-3', 'token-4', 'token-5'];
    env.getAccessToken = vi.fn(async () => tokens.shift() ?? 'token-x');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  /** A match she is in, as the server knows it; the page has just reloaded (no live state). */
  function aMatch() {
    const { payload } = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    const self = payload.selfParticipantId;
    const opponent = payload.participants.find((p) => p.participantId !== self)!.participantId;
    return { matchId: payload.matchId, self, opponent, participants: payload.participants };
  }

  /** `/match` asks to rejoin on a closed socket: it opens, subscribes and resyncs. */
  async function rejoin(matchId: string) {
    realtime.rejoinMatch(matchId);
    expect(state().rejoin).toEqual({ matchId, state: 'pending' });
    await tick();
    last().open();
    expect(last().isSubscribed(matchTopic(matchId))).toBe(true);
    expect(last().sentTo(matchResync(matchId))).toBe(1);
  }

  it('MATCH_FOUND stores the live match id; an outcome clears it', async () => {
    realtime.joinQuickMatch();
    await tick();
    last().open();
    const found = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    last().deliver(found);
    const { matchId } = found.payload;
    expect(liveMatchId.load()).toEqual({ matchId });
    last().deliverTopic(matchId, matchAborted(matchId, 1));
    expect(liveMatchId.load()).toBeNull();
  });

  it('reload mid-question: the SNAPSHOT builds the live match on the open question, and she can answer', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    await rejoin(matchId);
    expect(state().live).toBeNull();
    last().deliver(
      snapshot(matchId, {
        refSeq: 7,
        questionIndex: 3,
        startedAt: T0,
        scores: [{ participantId: self, score: 2100 }, { participantId: opponent, score: 1300 }],
        participants,
        selfParticipantId: self,
      }),
    );
    expect(state().rejoin).toBeNull();
    expect(state().phase).toBe('found');
    expect(state().live).toMatchObject({
      matchId,
      selfParticipantId: self,
      participants,
      total: 10,
      phase: 'open',
      question: { questionIndex: 3 },
      myAnswer: null,
      totals: { [self]: 2100, [opponent]: 1300 },
      lastSeq: 7,
      connection: 'live',
      outcome: null,
    });
    expect(liveMatchId.load()).toEqual({ matchId });
    expect(realtime.submitAnswer(2)).toBe(true);
    expect(last().sentTo(matchAnswer(matchId))).toBe(1);
  });

  it('reload after a 1v1 answer: the question shows locked with her own result', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    await rejoin(matchId);
    last().deliver(
      snapshot(matchId, {
        refSeq: 8,
        questionIndex: 3,
        answered: [self],
        scores: [{ participantId: self, score: 2100 }, { participantId: opponent, score: 1300 }],
        participants,
        myAnswer: { pickedIndex: 1, correct: true, points: 800, answerIndex: 1, totalScore: 2900 },
      }),
    );
    expect(state().live!.myAnswer).toEqual({
      questionIndex: 3,
      optionIndex: 1,
      status: 'locked',
      result: { correct: true, points: 800, answerIndex: 1, totalScore: 2900 },
    });
    expect(realtime.submitAnswer(2)).toBe(false);
  });

  it('reload in the lead-in: the lead-in, then Q1 starts normally', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    await rejoin(matchId);
    last().deliver(
      snapshot(matchId, {
        refSeq: 0,
        phase: 'LEAD_IN',
        scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
        participants,
      }),
    );
    expect(state().live).toMatchObject({ phase: 'lead-in', question: null, lastSeq: 0 });
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    expect(state().live).toMatchObject({ phase: 'open', question: { questionIndex: 0 }, lastSeq: 1 });
  });

  it('Back to your match in a new tab: rejoins on the socket already open (after ALREADY_IN_MATCH)', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    realtime.joinQuickMatch();
    await tick();
    last().open();
    last().deliver(serverError('ALREADY_IN_MATCH', matchId));
    expect(state().problem).toEqual({ kind: 'alreadyInMatch', matchId });
    realtime.rejoinMatch(matchId);
    expect(clients).toHaveLength(1);
    expect(last().isSubscribed(matchTopic(matchId))).toBe(true);
    expect(last().sentTo(matchResync(matchId))).toBe(1);
    last().deliver(
      snapshot(matchId, {
        refSeq: 5,
        questionIndex: 2,
        scores: [{ participantId: self, score: 1500 }, { participantId: opponent, score: 700 }],
        participants,
      }),
    );
    expect(state()).toMatchObject({ phase: 'found', problem: null, rejoin: null });
    expect(state().live).toMatchObject({ matchId, phase: 'open', totals: { [self]: 1500 } });
    // A fresh tab learns the id here, so its next reload rejoins too.
    expect(liveMatchId.load()).toEqual({ matchId });
  });

  it('a slow reload (grace expired): SNAPSHOT youForfeited settles her as forfeited and clears the stored id', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    liveMatchId.save({ matchId });
    await rejoin(matchId);
    last().deliver(
      snapshot(matchId, {
        refSeq: 9,
        phase: 'REVEAL',
        questionIndex: 4,
        scores: [{ participantId: self, score: 2100, forfeited: true }, { participantId: opponent, score: 1300 }],
        participants,
        youForfeited: true,
      }),
    );
    expect(state().live!.outcome).toEqual({
      kind: 'forfeited',
      scores: [{ participantId: self, score: 2100 }, { participantId: opponent, score: 1300 }],
    });
    expect(state().live!.forfeited).toEqual([self]);
    expect(liveMatchId.load()).toBeNull();
  });

  it('the match is over, or not hers: NOT_IN_MATCH marks the rejoin gone and clears the stored id', async () => {
    const { matchId } = aMatch();
    liveMatchId.save({ matchId });
    await rejoin(matchId);
    last().deliver(serverError('NOT_IN_MATCH', matchId));
    expect(state().rejoin).toEqual({ matchId, state: 'gone' });
    expect(state().live).toBeNull();
    expect(state().problem).toBeNull();
    expect(liveMatchId.load()).toBeNull();
    expect(last().isSubscribed(matchTopic(matchId))).toBe(false);
    // Nothing more is asked.
    await tick(RESYNC_RETRY_MS * 2);
    expect(last().sentTo(matchResync(matchId))).toBe(1);
  });

  it('no SNAPSHOT: resync is retried every 3 s, and at 10 s the rejoin gives up', async () => {
    const { matchId } = aMatch();
    liveMatchId.save({ matchId });
    await rejoin(matchId);
    await tick(RESYNC_RETRY_MS);
    expect(last().sentTo(matchResync(matchId))).toBe(2);
    await tick(RESYNC_RETRY_MS);
    expect(last().sentTo(matchResync(matchId))).toBe(3);
    expect(state().rejoin!.state).toBe('pending');
    await tick(REJOIN_TIMEOUT_MS - 2 * RESYNC_RETRY_MS);
    expect(state().rejoin).toEqual({ matchId, state: 'gone' });
    expect(liveMatchId.load()).toBeNull();
    await tick(RESYNC_RETRY_MS * 2);
    expect(last().sentTo(matchResync(matchId))).toBe(4);
  });

  it('frames during the rejoin are held: seq 12 and 13 before SNAPSHOT refSeq=12, 12 dropped, 13 applied', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    await rejoin(matchId);
    last().deliverTopic(matchId, scoreboard(matchId, 13, 3, [self, opponent]));
    last().deliverTopic(matchId, scoreboard(matchId, 12, 3, [opponent]));
    expect(state().live).toBeNull();
    last().deliver(
      snapshot(matchId, {
        refSeq: 12,
        questionIndex: 3,
        answered: [self],
        scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
        participants,
      }),
    );
    expect(state().live).toMatchObject({ lastSeq: 13, answered: [self, opponent] });
  });

  it('the socket drops while rejoining: it reopens, re-subscribes and resyncs', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    await rejoin(matchId);
    last().drop();
    expect(clients).toHaveLength(1);
    await tick(1_000);
    expect(clients).toHaveLength(2);
    last().open();
    expect(last().isSubscribed(matchTopic(matchId))).toBe(true);
    expect(last().sentTo(matchResync(matchId))).toBe(1);
    last().deliver(
      snapshot(matchId, {
        refSeq: 3,
        questionIndex: 1,
        scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
        participants,
      }),
    );
    expect(state().live).toMatchObject({ matchId, phase: 'open' });
  });

  it('does nothing for the live match, or a rejoin already under way', async () => {
    realtime.joinQuickMatch();
    await tick();
    last().open();
    const found = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    last().deliver(found);
    const { matchId } = found.payload;
    realtime.rejoinMatch(matchId);
    expect(last().sentTo(matchResync(matchId))).toBe(0);
    expect(state().rejoin).toBeNull();

    // Another match id while this one is in play: never shown as that match.
    realtime.rejoinMatch('another-match');
    expect(state().rejoin).toEqual({ matchId: 'another-match', state: 'gone' });
    expect(state().live!.matchId).toBe(matchId);
  });

  it('a SNAPSHOT with no selfParticipantId (an older server) cannot rebuild the match', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    await rejoin(matchId);
    last().deliver(
      snapshot(matchId, {
        refSeq: 3,
        scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
        participants,
        selfParticipantId: null,
      }),
    );
    expect(state().live).toBeNull();
    expect(state().rejoin!.state).toBe('pending');
  });

  it('self listed second: the SNAPSHOT selfParticipantId, not the first participant, is who she is', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    const reordered = [participants[1]!, participants[0]!];
    await rejoin(matchId);
    last().deliver(
      snapshot(matchId, {
        refSeq: 4,
        questionIndex: 2,
        scores: [{ participantId: opponent, score: 700 }, { participantId: self, score: 1500 }],
        participants: reordered,
        selfParticipantId: self,
      }),
    );
    expect(state().live!.selfParticipantId).toBe(self);
    expect(state().live!.participants).toEqual(reordered);
    expect(state().live!.totals[self]).toBe(1500);
  });

  it('a failed URL id never clears a different stored match id', async () => {
    const { matchId } = aMatch();
    liveMatchId.save({ matchId: 'the-stored-match' });
    await rejoin(matchId);
    last().deliver(serverError('NOT_IN_MATCH', matchId));
    expect(state().rejoin).toEqual({ matchId, state: 'gone' });
    expect(liveMatchId.load()).toEqual({ matchId: 'the-stored-match' });
  });

  it('a NOT_IN_MATCH about another match, or with no match id, does not end the rejoin', async () => {
    const { matchId } = aMatch();
    await rejoin(matchId);
    last().deliver(serverError('NOT_IN_MATCH', 'another-match'));
    last().deliver(serverError('NOT_IN_MATCH'));
    expect(state().rejoin).toEqual({ matchId, state: 'pending' });
  });

  it('cancelRejoin stops it: timers, topic and held frames go, the stored id stays, a late SNAPSHOT changes nothing', async () => {
    const { matchId, self, opponent, participants } = aMatch();
    liveMatchId.save({ matchId });
    await rejoin(matchId);
    realtime.cancelRejoin('another-match');
    expect(state().rejoin!.state).toBe('pending');
    realtime.cancelRejoin(matchId);
    expect(state().rejoin).toBeNull();
    expect(last().isSubscribed(matchTopic(matchId))).toBe(false);
    expect(liveMatchId.load()).toEqual({ matchId });
    last().deliver(
      snapshot(matchId, {
        refSeq: 4,
        scores: [{ participantId: self, score: 0 }, { participantId: opponent, score: 0 }],
        participants,
      }),
    );
    expect(state().live).toBeNull();
    expect(state().phase).toBe('idle');
    await tick(REJOIN_TIMEOUT_MS);
    expect(state().rejoin).toBeNull();
    expect(last().sentTo(matchResync(matchId))).toBe(1);
    // Asking again (StrictMode's second mount) rejoins afresh.
    realtime.rejoinMatch(matchId);
    expect(last().sentTo(matchResync(matchId))).toBe(2);
  });

  it('a MATCH_FOUND while rejoining replaces the rejoin', async () => {
    const { matchId } = aMatch();
    await rejoin(matchId);
    const found = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    last().deliver(found);
    expect(state().rejoin).toBeNull();
    expect(liveMatchId.load()).toEqual({ matchId: found.payload.matchId });
    // Its frames apply at once (nothing is held for the old rejoin).
    last().deliverTopic(found.payload.matchId, questionStarted(found.payload.matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    expect(state().live!.phase).toBe('open');
  });
});

describe('Topic Duel (Story 4.2)', () => {
  const TOPIC = { topicId: '7c1f0c9a-1111-4a2b-8c3d-0e1f2a3b4c5d', name: 'Kerala History', subjectName: 'History' };
  const DUEL_JOIN = '/app/matchmaking/TOPIC_DUEL/join';
  const DUEL_CANCEL = '/app/matchmaking/TOPIC_DUEL/cancel';

  it('an empty topic id is still a Topic Duel join, never a silent Quick Match', async () => {
    realtime.joinQuickMatch('');
    await flush();
    last().open();
    expect(last().published).toEqual([{ destination: DUEL_JOIN, body: JSON.stringify({ topicId: '' }) }]);
  });

  it('joins the Topic Duel queue with the topic id in the body, and a cancel names the same mode', async () => {
    realtime.joinQuickMatch(TOPIC.topicId);
    await flush();
    last().open();
    expect(last().published).toEqual([{ destination: DUEL_JOIN, body: JSON.stringify({ topicId: TOPIC.topicId }) }]);
    expect(realtime.cancelMatchmaking()).toBe('sent');
    expect(last().sentTo(DUEL_CANCEL)).toBe(1);
    expect(last().sentTo(CANCEL)).toBe(0);
    last().deliver(MATCHMAKING_CANCELLED);
    // A later Quick Match goes back to the Quick queue.
    realtime.joinQuickMatch();
    expect(last().sentTo(JOIN)).toBe(1);
    expect(realtime.cancelMatchmaking()).toBe('sent');
    expect(last().sentTo(CANCEL)).toBe(1);
  });

  it('keeps the topic from MATCH_FOUND in the live match and the store', async () => {
    realtime.joinQuickMatch(TOPIC.topicId);
    await flush();
    last().open();
    const found = matchFound({ name: 'Vishnu R', kind: 'GUEST' });
    last().deliver({ ...found, payload: { ...found.payload, mode: 'TOPIC_DUEL', topic: TOPIC } });
    expect(state().match!.topic).toEqual(TOPIC);
    expect(state().live!.topic).toEqual(TOPIC);
  });

  it('a Quick Match has no topic', async () => {
    await joinAndOpen();
    last().deliver(matchFound({ name: 'Vishnu R', kind: 'GUEST' }));
    expect(state().live).not.toHaveProperty('topic');
  });

  it('MATCHMAKING_FAILED TOPIC_UNAVAILABLE is its own problem; any other reason stays a matchmaking one', async () => {
    realtime.joinQuickMatch(TOPIC.topicId);
    await flush();
    last().open();
    last().deliver({ ...MATCHMAKING_FAILED, payload: { reason: 'TOPIC_UNAVAILABLE' } });
    expect(state()).toMatchObject({ phase: 'failed', problem: { kind: 'topicUnavailable' } });
    realtime.joinQuickMatch(TOPIC.topicId);
    last().deliver(MATCHMAKING_FAILED);
    expect(state()).toMatchObject({ phase: 'failed', problem: { kind: 'matchmaking' } });
  });

  it('INVALID_TOPIC fails the search as a rejected join', async () => {
    realtime.joinQuickMatch(TOPIC.topicId);
    await flush();
    last().open();
    last().deliver(serverError('INVALID_TOPIC'));
    expect(state()).toMatchObject({ phase: 'failed', problem: { kind: 'rejected', code: 'INVALID_TOPIC' } });
  });

  it('a rematch whose topic is too small reverts with its own note', async () => {
    await joinAndOpen();
    const found = matchFound({ name: 'Vishnu R', kind: 'GUEST' });
    last().deliver(found);
    const { matchId } = found.payload;
    realtime.requestRematch(matchId);
    last().deliver({ ...MATCHMAKING_FAILED, payload: { reason: 'TOPIC_UNAVAILABLE' } });
    expect(state().rematch).toEqual({ matchId, state: 'idle', note: 'topicUnavailable' });
  });

  it('a rejoin rebuilds the topic from the SNAPSHOT', async () => {
    const { payload } = matchFound({ name: 'Minnal Bot', kind: 'BOT' });
    const { matchId, participants } = payload;
    realtime.rejoinMatch(matchId);
    await flush();
    last().open();
    const reply = snapshot(matchId, {
      refSeq: 4,
      scores: participants.map((p) => ({ participantId: p.participantId, score: 0 })),
      participants,
    });
    last().deliver({ ...reply, payload: { ...reply.payload, topic: TOPIC } });
    expect(state().live!.topic).toEqual(TOPIC);
  });
});
