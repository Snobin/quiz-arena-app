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
    const closed = parseRoomIncoming(text('room-closed.json'));
    expect(closed).toMatchObject({ type: 'ROOM_CLOSED', payload: { reason: 'EXPIRED' } });
  });

  it('parse the room errors, with their room id', () => {
    const busy = parseRoomIncoming(text('error-room-already-in-room.json'));
    expect(busy).toMatchObject({ type: 'ERROR', payload: { code: 'ALREADY_IN_MATCH' } });
    expect(busy?.type === 'ERROR' && busy.payload.roomId).toBeTruthy();
    expect(parseRoomIncoming(text('error-room-invalid-config.json'))).toMatchObject({ type: 'ERROR', payload: { code: 'INVALID_ROOM_CONFIG' } });
  });

  it('reject a malformed room, and leave other message types as OTHER', () => {
    const sample = JSON.parse(text('room-joined.json')) as { payload: { room: Record<string, unknown> } };
    expect(parseRoomJoined({ ...sample.payload, role: 'ADMIN' })).toBeNull();
    expect(parseRoomJoined({ ...sample.payload, room: { ...sample.payload.room, humanCount: 'one' } })).toBeNull();
    expect(parseRoomJoined({ ...sample.payload, room: { ...sample.payload.room, source: { type: 'BANK', topicId: 7 } } })).toBeNull();
    expect(parseRoomIncoming('not json')).toBeNull();
    expect(parseRoomIncoming(text('match-found.json'))?.type).toBe('OTHER');
  });
});
