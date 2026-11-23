import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRoomIncoming, parseRoomJoined } from './roomProtocol.ts';

const SAMPLES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../contracts/samples');
const text = (file: string) => readFileSync(join(SAMPLES, file), 'utf8');

describe('room parsers over the golden samples', () => {
  it('parse ROOM_JOINED, ROOM_LOBBY_UPDATED and ROOM_CLOSED', () => {
    const joined = parseRoomIncoming(text('room-joined.json'));
    expect(joined?.type).toBe('ROOM_JOINED');
    if (joined?.type !== 'ROOM_JOINED') return;
    expect(joined.payload.code).toBe('K7MQ2X');
    expect(joined.payload.role).toBe('HOST');
    expect(joined.payload.room.source).toEqual({ type: 'BANK', topicId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' });
    const lobby = parseRoomIncoming(text('room-lobby-updated.json'));
    expect(lobby?.type).toBe('ROOM_LOBBY_UPDATED');
    expect(lobby?.message.seq).toBe(2);
    if (lobby?.type !== 'ROOM_LOBBY_UPDATED') return;
    expect(lobby.payload.joined).toEqual(['9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a']);
    expect(lobby.payload.left).toEqual([]);
    const member = parseRoomIncoming(text('room-joined-member.json'));
    expect(member).toMatchObject({ type: 'ROOM_JOINED', payload: { role: 'MEMBER', room: { humanCount: 2 } } });
    expect(lobby.payload.phase).toBe('LOBBY');
    const closed = parseRoomIncoming(text('room-closed.json'));
    expect(closed).toMatchObject({ type: 'ROOM_CLOSED', payload: { reason: 'EXPIRED' } });
  });

  it('parse the Story 5.4 start frames: STARTING, the failure and the match', () => {
    expect(parseRoomIncoming(text('room-lobby-updated-starting.json'))).toMatchObject({
      type: 'ROOM_LOBBY_UPDATED',
      payload: { phase: 'STARTING', joined: [], left: [] },
    });
    expect(parseRoomIncoming(text('room-start-failed.json'))).toMatchObject({
      type: 'ROOM_START_FAILED',
      message: { seq: 4 },
      payload: { reason: 'TOPIC_UNAVAILABLE' },
    });
    const started = parseRoomIncoming(text('room-match-started.json'));
    expect(started).toMatchObject({
      type: 'ROOM_MATCH_STARTED',
      payload: {
        mode: 'BATTLE_ROOM',
        questionCount: 10,
        firstQuestionAt: '2026-11-12T10:15:33.623Z',
        topic: { name: 'Kerala History' },
      },
    });
    expect(started?.type === 'ROOM_MATCH_STARTED' && started.payload.participants).toHaveLength(2);
    const bad = JSON.parse(text('room-match-started.json')) as { payload: Record<string, unknown> };
    expect(parseRoomIncoming(JSON.stringify({ ...bad, type: 'ROOM_MATCH_STARTED', payload: { ...bad.payload, firstQuestionAt: 'soon' } }))).toBeNull();
    const failed = JSON.parse(text('room-start-failed.json')) as { payload: Record<string, unknown> };
    expect(parseRoomIncoming(JSON.stringify({ ...failed, payload: { reason: '422' } }))).toBeNull();
  });

  it('parse the room errors, with their room id', () => {
    const busy = parseRoomIncoming(text('error-room-already-in-room.json'));
    expect(busy).toMatchObject({ type: 'ERROR', payload: { code: 'ALREADY_IN_MATCH' } });
    expect(busy?.type === 'ERROR' && busy.payload.roomId).toBeTruthy();
    expect(parseRoomIncoming(text('error-room-invalid-config.json'))).toMatchObject({ type: 'ERROR', payload: { code: 'INVALID_ROOM_CONFIG' } });
    for (const code of ['not-found', 'expired', 'full', 'started', 'not-enough-players']) {
      expect(parseRoomIncoming(text(`error-room-${code}.json`))?.type).toBe('ERROR');
    }
  });

  it('reject a malformed room, and leave other message types as OTHER', () => {
    const sample = JSON.parse(text('room-joined.json')) as { payload: { room: Record<string, unknown> } };
    expect(parseRoomJoined({ ...sample.payload, role: 'ADMIN' })).toBeNull();
    expect(parseRoomJoined({ ...sample.payload, room: { ...sample.payload.room, humanCount: 'one' } })).toBeNull();
    expect(parseRoomJoined({ ...sample.payload, room: { ...sample.payload.room, source: { type: 'BANK', topicId: 7 } } })).toBeNull();
    expect(parseRoomIncoming('not json')).toBeNull();
    const lobby = JSON.parse(text('room-lobby-updated.json')) as { payload: Record<string, unknown> };
    expect(parseRoomIncoming(JSON.stringify({ ...lobby, payload: { ...lobby.payload, joined: [7] } }))).toBeNull();
    expect(parseRoomIncoming(JSON.stringify({ ...lobby, payload: { room: lobby.payload.room } }))).toMatchObject({ payload: { joined: [], left: [] } });
    expect(parseRoomIncoming(text('match-found.json'))?.type).toBe('OTHER');
  });

  it('parse the Story 6.5 custom-topic samples the server emits, keeping the custom source and the name-only topic', () => {
    const lobby = parseRoomIncoming(text('room-lobby-updated-custom.json'));
    expect(lobby).toMatchObject({
      type: 'ROOM_LOBBY_UPDATED',
      payload: { room: { rated: false, source: { type: 'CUSTOM', customTopicId: '6f1b2c3d-1111-4222-8333-444455556666', topicName: 'Renaissance' } } },
    });
    const started = parseRoomIncoming(text('room-match-started-custom.json'));
    expect(started).toMatchObject({ type: 'ROOM_MATCH_STARTED', payload: { questionSource: 'CUSTOM', topic: { name: 'Renaissance' } } });
    expect(started?.type === 'ROOM_MATCH_STARTED' && started.payload.topic).not.toHaveProperty('topicId');
    expect(parseRoomIncoming(text('room-start-failed-source-unavailable.json'))).toMatchObject({
      type: 'ROOM_START_FAILED',
      payload: { reason: 'SOURCE_UNAVAILABLE' },
    });
    // A bank match start still reads as before (no questionSource on a sample from an older server).
    const bank = JSON.parse(text('room-match-started.json')) as { payload: Record<string, unknown> };
    delete bank.payload.questionSource;
    expect(parseRoomIncoming(JSON.stringify(bank))).toMatchObject({ type: 'ROOM_MATCH_STARTED' });
    // Wrong types are refused.
    const custom = JSON.parse(text('room-lobby-updated-custom.json')) as { payload: { room: { source: Record<string, unknown> } } };
    custom.payload.room.source.topicName = 7;
    expect(parseRoomIncoming(JSON.stringify(custom))).toBeNull();
  });
});
