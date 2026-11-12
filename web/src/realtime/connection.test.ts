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
  matchFound,
  questionRevealed,
  questionStarted,
  scoreboard,
  serverError,
} from '../test-utils/realtime.ts';
import { createRealtime, sameOriginUrl, type Realtime, type RealtimeEnv } from './connection.ts';
import { INITIAL_LIVE_GAME, liveGameStore } from './liveGameStore.ts';
import { matchAnswer, matchTopic, USER_PRIVATE_QUEUE } from './protocol.ts';

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

  it('drops broadcasts with seq ≤ lastSeq, and those for another match; a gap is applied anyway', async () => {
    const { matchId, opponent } = await found();
    last().deliverTopic(matchId, questionStarted(matchId, { seq: 1, questionIndex: 0, startedAt: T0 }));
    last().deliverTopic(matchId, scoreboard(matchId, 2, 0, [opponent]));
    last().deliverTopic(matchId, scoreboard(matchId, 2, 0, []));
    last().deliverTopic(matchId, scoreboard(matchId, 1, 0, []));
    expect(state().live!.answered).toEqual([opponent]);
    last().deliverTopic(matchId, scoreboard('another-match', 3, 0, []));
    expect(state().live!.answered).toEqual([opponent]);
    last().deliverTopic(matchId, scoreboard(matchId, 7, 0, []));
    expect(state().live).toMatchObject({ answered: [], lastSeq: 7 });
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
