import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ENUMS,
  parseAnswerAccepted,
  parseErrorPayload,
  parseIncoming,
  parseMatchFound,
  parseMatchAborted,
  parseMatchEnded,
  parseMatchmakingFailed,
  parseParticipantForfeited,
  parseQuestionRevealed,
  parseQuestionStarted,
  parseQuestionView,
  parseRematchDeclined,
  parseRematchExpired,
  parseRematchRequested,
  parseScoreboard,
  parseServerMessage,
  parseSnapshot,
  type AnswerRequest,
  type RoomClosedPayload,
  type RoomJoinedPayload,
} from './protocol.ts';

/**
 * The client half of the contract: `contracts` (Java) writes one golden sample per message to
 * contracts/samples/ (RealtimeSamplesTest); these must parse with the very parsers the WebSocket
 * module uses, and the TS enum unions must list exactly the Java enum values.
 */
const SAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../contracts/samples');
const read = (file: string): unknown => JSON.parse(readFileSync(join(SAMPLES, file), 'utf8'));

// The question-set DTOs and the `minnal.match.completed` event travel only between services
// (never to the browser), so the client has no parser for them; `client-*` samples are bodies the
// client sends; every other sample is a STOMP frame body the server sends.
// `code-normalisation.json` is the shared room-code table (Story 5.3), read by screens/rooms/roomCode.test.ts.
const SERVER_ONLY = new Set(['enums.json', 'match-completed.json', 'code-normalisation.json']);
const ALL_SERVER_MESSAGES = readdirSync(SAMPLES).filter(
  (file) =>
    file.endsWith('.json') && !SERVER_ONLY.has(file) && !file.startsWith('question-set-') && !file.startsWith('client-'),
);
// Room messages (Story 5.1) have types here; their runtime parsers live in the lazy rooms chunk (Story 5.2, entry
// budget: screens/rooms/roomProtocol.test.ts), so they are checked at the envelope only, below.
const ROOM_MESSAGES = ALL_SERVER_MESSAGES.filter((file) => file.startsWith('room-'));
const SERVER_MESSAGES = ALL_SERVER_MESSAGES.filter((file) => !file.startsWith('room-'));

describe('contracts/samples', () => {
  it('has the room samples, which parse at the envelope and carry the room fields', () => {
    expect(ROOM_MESSAGES).toEqual(['room-closed.json', 'room-joined-member.json', 'room-joined.json', 'room-lobby-updated.json']);
    for (const file of ROOM_MESSAGES) {
      const json = read(file);
      expect(parseServerMessage(json)).toEqual(json);
      expect(parseServerMessage(json)!.roomId).toBeDefined();
    }
    const joined = parseServerMessage(read('room-joined.json'))!;
    expect(joined.type).toBe('ROOM_JOINED');
    expect(joined.refSeq).toBeDefined();
    expect(joined.seq).toBeUndefined();
    const room = joined.payload as RoomJoinedPayload;
    expect(room.role).toBe('HOST');
    expect(room.room.rated).toBe(true);
    expect(room.room.participants.map((p) => p.participantId)).toContain(room.selfParticipantId);
    expect(room.room.humanCount).toBe(room.room.participants.length);
    const broadcast = parseServerMessage(read('room-lobby-updated.json'))!;
    expect(broadcast.seq).toBe(2);
    expect(broadcast.refSeq).toBeUndefined();
    expect((parseServerMessage(read('room-closed.json'))!.payload as RoomClosedPayload).reason).toBe('EXPIRED');
  });

  it('the room error samples parse with their roomId and codes', () => {
    const busy = parseServerMessage(read('error-room-already-in-room.json'))!;
    expect(parseErrorPayload(busy.payload)).toEqual({ code: 'ALREADY_IN_MATCH', roomId: busy.roomId });
    const notHost = parseServerMessage(read('error-room-not-host.json'))!;
    expect(parseErrorPayload(notHost.payload)).toEqual({ code: 'NOT_HOST', roomId: notHost.roomId });
    expect(parseErrorPayload(parseServerMessage(read('error-room-invalid-config.json'))!.payload)).toEqual({
      code: 'INVALID_ROOM_CONFIG',
    });
    // Story 5.3: a refused join names no room; a start with too few players names its room.
    for (const [file, code] of [
      ['error-room-not-found.json', 'ROOM_NOT_FOUND'],
      ['error-room-expired.json', 'ROOM_EXPIRED'],
      ['error-room-full.json', 'ROOM_FULL'],
      ['error-room-started.json', 'ROOM_STARTED'],
    ] as const) {
      expect(parseErrorPayload(parseServerMessage(read(file))!.payload)).toEqual({ code });
    }
    const few = parseServerMessage(read('error-room-not-enough-players.json'))!;
    expect(parseErrorPayload(few.payload)).toEqual({ code: 'NOT_ENOUGH_PLAYERS', roomId: few.roomId });
    expect(read('client-room-join.json')).toEqual({ code: 'K7M-Q2X' });
  });

  it('has the server-message samples', () => {
    expect(SERVER_MESSAGES).toEqual(
      expect.arrayContaining([
        'match-found.json',
        'matchmaking-failed.json',
        'matchmaking-cancelled.json',
        'error-already-in-match.json',
        'error-server-draining.json',
        'question-started.json',
        'answer-accepted.json',
        'answer-accepted-1v1.json',
        'scoreboard.json',
        'question-revealed.json',
        'question-revealed-no-attribution.json',
        'error-answer-rejected.json',
        'error-not-in-match.json',
        'error-rate-limited.json',
        'snapshot.json',
        'snapshot-forfeited.json',
        'participant-forfeited.json',
        'match-aborted.json',
        'match-ended.json',
        'rematch-requested.json',
        'rematch-declined.json',
        'rematch-declined-unavailable.json',
        'rematch-expired.json',
        'match-found-topic-duel.json',
        'snapshot-topic-duel.json',
        'match-ended-topic-duel.json',
        'matchmaking-failed-topic-unavailable.json',
        'error-invalid-topic.json',
      ]),
    );
  });

  it.each(SERVER_MESSAGES)('%s parses as a ServerMessage and round-trips unchanged', (file) => {
    const json = read(file);
    const message = parseServerMessage(json);
    expect(message).not.toBeNull();
    expect(message).toEqual(json);
    const incoming = parseIncoming(JSON.stringify(json));
    expect(incoming).not.toBeNull();
    // Every type the server sends today has a typed variant.
    expect(incoming!.type).not.toBe('OTHER');
  });

  it('match-found.json: the payload parses, with the receiver among the participants', () => {
    const message = parseServerMessage(read('match-found.json'))!;
    const payload = parseMatchFound(message.payload);
    expect(payload).toEqual(message.payload);
    expect(payload!.participants.map((p) => p.kind)).toEqual(['GUEST', 'BOT']);
    expect(payload!.participants.some((p) => p.participantId === payload!.selfParticipantId)).toBe(true);
  });

  it('matchmaking-failed.json and the error samples: their payloads parse', () => {
    expect(parseMatchmakingFailed(parseServerMessage(read('matchmaking-failed.json'))!.payload)).toEqual({
      reason: 'QUESTION_SET_UNAVAILABLE',
    });
    const inMatch = parseServerMessage(read('error-already-in-match.json'))!;
    expect(parseErrorPayload(inMatch.payload)).toEqual({ code: 'ALREADY_IN_MATCH', matchId: inMatch.matchId });
    expect(parseErrorPayload(parseServerMessage(read('error-server-draining.json'))!.payload)).toEqual({
      code: 'SERVER_DRAINING',
    });
  });

  it('the Topic Duel samples carry the topic block on MATCH_FOUND, SNAPSHOT and MATCH_ENDED, and Quick samples none', () => {
    const topic = { topicId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Kerala History', subjectName: 'History' };
    const found = parseMatchFound(parseServerMessage(read('match-found-topic-duel.json'))!.payload);
    expect(found).toMatchObject({ mode: 'TOPIC_DUEL', topic });
    expect(parseSnapshot(parseServerMessage(read('snapshot-topic-duel.json'))!.payload)).toMatchObject({ topic });
    expect(parseMatchEnded(parseServerMessage(read('match-ended-topic-duel.json'))!.payload)).toMatchObject({ mode: 'TOPIC_DUEL', topic });
    for (const quick of ['match-found.json', 'snapshot.json', 'match-ended.json']) {
      expect(JSON.stringify(read(quick))).not.toContain('"topic"');
    }
    expect(parseMatchFound(parseServerMessage(read('match-found.json'))!.payload)).not.toHaveProperty('topic');
  });

  it('a malformed topic block is refused', () => {
    const payload = parseServerMessage(read('match-found-topic-duel.json'))!.payload as Record<string, unknown>;
    expect(parseMatchFound({ ...payload, topic: { topicId: 't', name: 5, subjectName: 'x' } })).toBeNull();
    expect(parseMatchFound({ ...payload, topic: 'Kerala History' })).toBeNull();
  });

  it('matchmaking-failed-topic-unavailable.json and error-invalid-topic.json: their payloads parse', () => {
    expect(parseMatchmakingFailed(parseServerMessage(read('matchmaking-failed-topic-unavailable.json'))!.payload)).toEqual({
      reason: 'TOPIC_UNAVAILABLE',
    });
    expect(parseErrorPayload(parseServerMessage(read('error-invalid-topic.json'))!.payload)).toEqual({ code: 'INVALID_TOPIC' });
  });

  it('matchmaking-cancelled.json has no payload', () => {
    expect(parseServerMessage(read('matchmaking-cancelled.json'))).not.toHaveProperty('payload');
  });

  it('question-started.json: a broadcast with seq, and a question with no answer fields', () => {
    const message = parseServerMessage(read('question-started.json'))!;
    expect(message.seq).toBe(1);
    expect(message.refSeq).toBeUndefined();
    const payload = parseQuestionStarted(message.payload)!;
    expect(payload).toEqual(message.payload);
    expect(payload.questionIndex).toBe(0);
    expect(payload.total).toBe(10);
    expect(Object.keys((message.payload as Record<string, unknown>).question as object)).toEqual([
      'questionId',
      'version',
      'textMl',
      'textEn',
      'options',
    ]);
    expect(Date.parse(payload.deadline) - Date.parse(payload.startedAt)).toBe(15_000);
  });

  it('answer-accepted.json: a private receipt with refSeq and no seq', () => {
    const message = parseServerMessage(read('answer-accepted.json'))!;
    expect(message.refSeq).toBe(1);
    expect(message.seq).toBeUndefined();
    expect(parseAnswerAccepted(message.payload)).toEqual({ questionIndex: 0, result: null });
  });

  it('answer-accepted-1v1.json: the receipt plus her own result (Story 1.11)', () => {
    const message = parseServerMessage(read('answer-accepted-1v1.json'))!;
    expect(message.refSeq).toBe(1);
    expect(message.seq).toBeUndefined();
    expect(parseAnswerAccepted(message.payload)).toEqual({
      questionIndex: 0,
      result: { correct: true, points: 750, answerIndex: 0, totalScore: 1625 },
    });
  });

  it.each([
    ['a partial result', { questionIndex: 0, correct: true, points: 750 }],
    ['a non-boolean correct', { questionIndex: 0, correct: 'yes', points: 750, answerIndex: 0, totalScore: 750 }],
    ['an answerIndex out of range', { questionIndex: 0, correct: true, points: 750, answerIndex: 4, totalScore: 750 }],
    ['a fractional total', { questionIndex: 0, correct: true, points: 750, answerIndex: 0, totalScore: 7.5 }],
  ])('ANSWER_ACCEPTED with %s is rejected', (_, value) => {
    expect(parseAnswerAccepted(value)).toBeNull();
  });

  it('scoreboard.json: who answered, nothing more', () => {
    const message = parseServerMessage(read('scoreboard.json'))!;
    expect(message.seq).toBe(2);
    expect(parseScoreboard(message.payload)).toEqual(message.payload);
  });

  it('question-revealed*.json: results, with an absent pick and attribution mapped to null', () => {
    const full = parseQuestionRevealed(parseServerMessage(read('question-revealed.json'))!.payload)!;
    expect(full.attribution).toBe('Kerala PSC 2019, Q 14');
    expect(full.results.map((r) => [r.pickedIndex, r.correct, r.points, r.totalScore])).toEqual([
      [0, true, 875, 875],
      [2, false, 0, 0],
    ]);
    const bare = parseQuestionRevealed(parseServerMessage(read('question-revealed-no-attribution.json'))!.payload)!;
    expect(bare.attribution).toBeNull();
    expect(bare.results[0]!.pickedIndex).toBeNull();
    expect(bare.results[1]!.pickedIndex).toBe(3);
  });

  it('the match error samples parse, with refSeq on ANSWER_REJECTED', () => {
    const rejected = parseServerMessage(read('error-answer-rejected.json'))!;
    expect(rejected.refSeq).toBe(3);
    expect(parseErrorPayload(rejected.payload)).toEqual({ code: 'ANSWER_REJECTED', matchId: rejected.matchId });
    expect(parseErrorPayload(parseServerMessage(read('error-not-in-match.json'))!.payload)!.code).toBe('NOT_IN_MATCH');
    expect(parseErrorPayload(parseServerMessage(read('error-rate-limited.json'))!.payload)).toEqual({
      code: 'RATE_LIMITED',
    });
  });

  it('snapshot*.json: a private reply with refSeq; the open question without its answer, her 1v1 result (Story 1.9)', () => {
    const message = parseServerMessage(read('snapshot.json'))!;
    expect(message.refSeq).toBe(12);
    expect(message).not.toHaveProperty('seq');
    const open = parseSnapshot(message.payload)!;
    expect(open.phase).toBe('QUESTION_OPEN');
    expect(open.question).not.toBeNull();
    expect(open.question).not.toHaveProperty('answerIndex');
    expect(open.deadline).toBe('2026-11-12T10:15:39.123Z');
    expect(open.lastReveal!.questionIndex).toBe(2);
    expect(open.myAnswer).toEqual({ pickedIndex: 1, result: { correct: true, points: 900, answerIndex: 1, totalScore: 3040 } });
    expect(open.scores.map((s) => s.forfeited)).toEqual([false, false]);
    expect(open.selfParticipantId).toBe('0b7e9c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d');
    // Optional on parse: a snapshot from an older server, with no selfParticipantId, still parses.
    const { selfParticipantId: _self, ...older } = message.payload as Record<string, unknown>;
    expect(parseSnapshot(older)!.selfParticipantId).toBeNull();
    expect(parseSnapshot({ ...older, selfParticipantId: 7 })).toBeNull();

    const forfeited = parseSnapshot(parseServerMessage(read('snapshot-forfeited.json'))!.payload)!;
    expect(forfeited).toMatchObject({ phase: 'REVEAL', question: null, deadline: null, myAnswer: null, youForfeited: true });
  });

  it('participant-forfeited.json and match-aborted.json are broadcasts with seq', () => {
    const forfeited = parseServerMessage(read('participant-forfeited.json'))!;
    expect(forfeited.seq).toBe(13);
    expect(parseParticipantForfeited(forfeited.payload)).toEqual({
      participantId: '0b7e9c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d',
      questionIndex: 3,
    });
    const aborted = parseServerMessage(read('match-aborted.json'))!;
    expect(aborted.seq).toBe(2);
    expect(parseMatchAborted(aborted.payload)).toEqual({ reason: 'ALL_LEFT' });
  });

  it('client-answer.json is exactly the AnswerRequest the client sends', () => {
    const body: AnswerRequest = { questionIndex: 0, optionIndex: 2 };
    expect(read('client-answer.json')).toEqual(body);
  });

  it('enums.json lists exactly the TypeScript enum values', () => {
    const enums = read('enums.json') as Record<string, string[]>;
    expect(Object.keys(enums).sort()).toEqual(Object.keys(ENUMS).sort());
    for (const [name, values] of Object.entries(ENUMS)) {
      expect([...values], name).toEqual(enums[name]);
    }
  });
});

describe('parsers reject what the contract does not allow', () => {
  const ok = read('match-found.json') as Record<string, unknown>;
  const payload = ok.payload as Record<string, unknown>;

  it.each([
    ['not an object', 'x'],
    ['an unknown type', { ...ok, type: 'NOPE' }],
    ['no serverTime', { ...ok, serverTime: undefined }],
    ['a bad serverTime', { ...ok, serverTime: 'yesterday' }],
    ['a non-integer seq', { ...ok, seq: 1.5 }],
    ['a numeric matchId', { ...ok, matchId: 7 }],
  ])('envelope: %s', (_, value) => {
    expect(parseServerMessage(value)).toBeNull();
  });

  it.each([
    ['an unknown mode', { ...payload, mode: 'SOLO' }],
    ['an unknown participant kind', { ...payload, participants: [{ participantId: 'a', displayName: 'A', kind: 'ALIEN' }] }],
    ['a receiver who is not a participant', { ...payload, selfParticipantId: 'nobody' }],
    ['a missing questionCount', { ...payload, questionCount: undefined }],
  ])('MATCH_FOUND payload: %s', (_, value) => {
    expect(parseMatchFound(value)).toBeNull();
  });

  const started = (read('question-started.json') as Record<string, unknown>).payload as Record<string, unknown>;
  const view = started.question as Record<string, unknown>;
  const revealed = (read('question-revealed.json') as Record<string, unknown>).payload as Record<string, unknown>;

  it.each([
    ['three options', { ...view, options: ['a', 'b', 'c'] }],
    ['no text in either language', { ...view, textMl: undefined, textEn: undefined }],
    ['a numeric questionId', { ...view, questionId: 1 }],
  ])('QuestionView: %s', (_, value) => {
    expect(parseQuestionView(value)).toBeNull();
  });

  it.each([
    ['an index past the total', { ...started, questionIndex: 10 }],
    ['a negative index', { ...started, questionIndex: -1 }],
    ['a bad deadline', { ...started, deadline: 'soon' }],
  ])('QUESTION_STARTED payload: %s', (_, value) => {
    expect(parseQuestionStarted(value)).toBeNull();
  });

  it.each([
    ['an answer index of 4', { ...revealed, answerIndex: 4 }],
    ['a pick of 7', { ...revealed, results: [{ participantId: 'a', pickedIndex: 7, correct: false, points: 0, totalScore: 0 }] }],
    ['a result without points', { ...revealed, results: [{ participantId: 'a', correct: false, totalScore: 0 }] }],
  ])('QUESTION_REVEALED payload: %s', (_, value) => {
    expect(parseQuestionRevealed(value)).toBeNull();
  });

  it('a SCOREBOARD with a non-string participant is ignored', () => {
    expect(parseScoreboard({ questionIndex: 0, answered: [1] })).toBeNull();
    expect(
      parseIncoming('{"type":"SCOREBOARD","seq":2,"serverTime":"2026-11-12T10:00:00Z","payload":{"questionIndex":0}}'),
    ).toBeNull();
  });

  it('an ERROR with an unknown code, and non-JSON bodies, are ignored', () => {
    expect(parseErrorPayload({ code: 'TEAPOT' })).toBeNull();
    expect(parseIncoming('{"type":"ERROR","serverTime":"2026-11-12T10:00:00Z","payload":{"code":"TEAPOT"}}')).toBeNull();
    expect(parseIncoming('not json')).toBeNull();
  });

  const snap = (read('snapshot.json') as Record<string, unknown>).payload as Record<string, unknown>;

  it.each([
    ['an unknown phase', { ...snap, phase: 'PAUSED' }],
    ['a question outside an open phase', { ...snap, phase: 'REVEAL' }],
    ['an open phase without a deadline', { ...snap, deadline: undefined }],
    ['a partial own result', { ...snap, myAnswer: { pickedIndex: 1, correct: true } }],
    ['a score without forfeited', { ...snap, scores: [{ participantId: 'a', score: 0 }] }],
  ])('SNAPSHOT payload: %s', (_, value) => {
    expect(parseSnapshot(value)).toBeNull();
  });

  it('an unknown abort reason is ignored', () => {
    expect(parseMatchAborted({ reason: 'BORED' })).toBeNull();
  });
  const ended = (read('match-ended.json') as Record<string, unknown>).payload as Record<string, unknown>;

  it('match-ended.json: a private message with no seq; the payload parses with missing fields as null', () => {
    const message = parseServerMessage(read('match-ended.json'))!;
    expect(message.seq).toBeUndefined();
    expect(message.refSeq).toBeUndefined();
    const payload = parseMatchEnded(message.payload)!;
    expect(payload.participants.map((p) => p.placement)).toEqual([1, 2]);
    expect(payload.questions).toHaveLength(3);
    expect(payload.questions[0]!.attribution).toBe('Kerala PSC 2019, Q 14');
    expect(payload.questions[1]!.attribution).toBeNull();
    expect(payload.questions[1]!.textMl).toBeUndefined();
    expect(payload.breakdown[0]!.answers[2]).toEqual({ pickedIndex: null, correct: false, responseMs: null, points: 0 });
    expect(payload.breakdown.every((b) => b.answers.length === payload.questions.length)).toBe(true);
  });

  it.each([
    ['a breakdown that does not line up with the questions', { ...ended, breakdown: [{ participantId: 'a', answers: [] }] }],
    ['a placement of 0', { ...ended, participants: [{ ...(ended.participants as object[])[0], placement: 0 }] }],
    ['a question without its answer', { ...ended, questions: [{ ...(ended.questions as object[])[0], answerIndex: undefined }] }],
    ['an unknown source', { ...ended, questionSource: 'GPT' }],
  ])('MATCH_ENDED payload: %s', (_, value) => {
    expect(parseMatchEnded(value)).toBeNull();
  });

  it('the rematch samples: private messages about the ended match, with their payloads', () => {
    const requested = parseServerMessage(read('rematch-requested.json'))!;
    expect(requested.seq).toBeUndefined();
    expect(requested.matchId).toBeDefined();
    expect(parseRematchRequested(requested.payload)).toEqual(requested.payload);
    expect(parseRematchDeclined(parseServerMessage(read('rematch-declined.json'))!.payload)).toEqual({ reason: 'CANCELLED' });
    expect(parseRematchDeclined(parseServerMessage(read('rematch-declined-unavailable.json'))!.payload)).toEqual({
      reason: 'UNAVAILABLE',
    });
    const expired = parseIncoming(JSON.stringify(read('rematch-expired.json')))!;
    expect(expired.type).toBe('REMATCH_EXPIRED');
    expect(expired.message.matchId).toBe(requested.matchId);
  });

  it('malformed rematch messages are ignored', () => {
    expect(parseRematchRequested({ requestedBy: 'a', expiresAt: 'soon' })).toBeNull();
    expect(parseRematchDeclined({ reason: 'BORED' })).toBeNull();
    expect(parseRematchExpired(null)).toBeNull();
    // Each is about an ended match: without the envelope's matchId it is dropped.
    expect(
      parseIncoming('{"type":"REMATCH_EXPIRED","serverTime":"2026-11-12T10:00:00Z","payload":{}}'),
    ).toBeNull();
  });
});
