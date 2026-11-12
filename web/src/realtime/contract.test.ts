import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ENUMS,
  parseErrorPayload,
  parseIncoming,
  parseMatchFound,
  parseMatchmakingFailed,
  parseServerMessage,
} from './protocol.ts';

/**
 * The client half of the contract: `contracts` (Java) writes one golden sample per message to
 * contracts/samples/ (RealtimeSamplesTest); these must parse with the very parsers the WebSocket
 * module uses, and the TS enum unions must list exactly the Java enum values.
 */
const SAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../contracts/samples');
const read = (file: string): unknown => JSON.parse(readFileSync(join(SAMPLES, file), 'utf8'));

// The question-set DTOs travel only between services (never to the browser), so the client has
// no parser for them; every other sample is a STOMP frame body.
const SERVER_MESSAGES = readdirSync(SAMPLES).filter(
  (file) => file.endsWith('.json') && file !== 'enums.json' && !file.startsWith('question-set-'),
);

describe('contracts/samples', () => {
  it('has the server-message samples', () => {
    expect(SERVER_MESSAGES).toEqual(
      expect.arrayContaining([
        'match-found.json',
        'matchmaking-failed.json',
        'matchmaking-cancelled.json',
        'error-already-in-match.json',
        'error-server-draining.json',
        'broadcast-envelope.json',
      ]),
    );
  });

  it.each(SERVER_MESSAGES)('%s parses as a ServerMessage and round-trips unchanged', (file) => {
    const json = read(file);
    const message = parseServerMessage(json);
    expect(message).not.toBeNull();
    expect(message).toEqual(json);
    expect(parseIncoming(JSON.stringify(json))).not.toBeNull();
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

  it('matchmaking-cancelled.json has no payload and broadcast-envelope.json carries seq', () => {
    expect(parseServerMessage(read('matchmaking-cancelled.json'))).not.toHaveProperty('payload');
    expect(parseServerMessage(read('broadcast-envelope.json'))!.seq).toBe(7);
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

  it('an ERROR with an unknown code, and non-JSON bodies, are ignored', () => {
    expect(parseErrorPayload({ code: 'TEAPOT' })).toBeNull();
    expect(parseIncoming('{"type":"ERROR","serverTime":"2026-11-12T10:00:00Z","payload":{"code":"TEAPOT"}}')).toBeNull();
    expect(parseIncoming('not json')).toBeNull();
  });
});
