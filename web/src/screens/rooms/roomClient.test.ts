import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeRealtime, configureRealtimeForTests, resetRealtime } from '../../realtime/connection.ts';
import { USER_PRIVATE_QUEUE } from '../../realtime/protocol.ts';
import { FakeStomp, SERVER_TIME } from '../../test-utils/realtime.ts';
import { CREATE_TIMEOUT_MS, resetRoomClient, roomClient, useRoom } from './roomClient.ts';
import { ROOM_CREATE, ROOM_JOIN, roomConfigure, roomLeave, roomResync, roomStart, roomTopic } from './roomProtocol.ts';

const ROOM_ID = '8e9f0a1b-2c3d-4e5f-a6b7-c8d9e0f1a2b3';
const TOPIC = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SELF = '0b7e9c1a-2d3f-4a5b-8c6d-7e8f9a0b1c2d';
const CONFIG = { source: { type: 'BANK' as const, topicId: TOPIC }, questionCount: 10 };

let clients: FakeStomp[];
const socket = () => clients[clients.length - 1]!;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const view = (over: Record<string, unknown> = {}) => ({
  hostParticipantId: SELF,
  source: { type: 'BANK', topicId: TOPIC },
  questionCount: 10,
  rated: true,
  expiresAt: '2026-11-13T10:15:30.123Z',
  participants: [{ participantId: SELF, displayName: 'Anju', kind: 'USER' }],
  humanCount: 1,
  ...over,
});
const joined = (room = view()) => ({
  type: 'ROOM_JOINED',
  roomId: ROOM_ID,
  refSeq: 1,
  serverTime: SERVER_TIME,
  payload: { roomId: ROOM_ID, code: 'K7MQ2X', role: 'HOST', selfParticipantId: SELF, room },
});
const lobbyUpdated = (seq: number, room = view()) => ({ type: 'ROOM_LOBBY_UPDATED', roomId: ROOM_ID, seq, serverTime: SERVER_TIME, payload: { room } });
const closed = (reason: string) => ({ type: 'ROOM_CLOSED', roomId: ROOM_ID, seq: 9, serverTime: SERVER_TIME, payload: { reason } });
const error = (code: string, extra: Record<string, unknown> = {}) => ({ type: 'ERROR', serverTime: SERVER_TIME, payload: { code, ...extra } });

beforeEach(() => {
  clients = [];
  configureRealtimeForTests({
    factory: (config) => {
      const client = new FakeStomp(config);
      clients.push(client);
      return client;
    },
    getAccessToken: async () => 'token-1',
    url: () => 'ws://localhost/ws',
  });
});

afterEach(() => {
  resetRoomClient();
  resetRealtime();
});

async function createAndOpen() {
  const result = roomClient().create(CONFIG);
  await flush();
  socket().open();
  return result;
}

describe('the room client', () => {
  it('subscribes to the private queue before it publishes create, with the bearer token', async () => {
    const result = createAndOpen();
    await flush();
    expect(socket().authorization).toBe('Bearer token-1');
    expect(socket().subscribed).toEqual([USER_PRIVATE_QUEUE]);
    expect(socket().bodiesTo(ROOM_CREATE)).toEqual([CONFIG]);
    expect(useRoom.getState().phase).toBe('creating');
    socket().deliver(joined());
    const outcome = await result;
    expect(outcome.ok).toBe(true);
    expect(useRoom.getState()).toMatchObject({ phase: 'lobby', session: { roomId: ROOM_ID, code: 'K7MQ2X', role: 'HOST', lastSeq: 1 } });
    // The room topic is subscribed once ROOM_JOINED names the room.
    expect(socket().subscribed).toContain(roomTopic(ROOM_ID));
  });

  it('applies lobby updates in seq order, dropping a duplicate', async () => {
    const result = createAndOpen();
    await flush();
    socket().deliver(joined());
    await result;
    const topic = (message: unknown) => (socket() as unknown as { subscriptions: Map<string, (m: { body: string }) => void> }).subscriptions.get(roomTopic(ROOM_ID))!({ body: JSON.stringify(message) });
    topic(lobbyUpdated(2, view({ questionCount: 15 })));
    expect(useRoom.getState().session?.room.questionCount).toBe(15);
    topic(lobbyUpdated(2, view({ questionCount: 20 })));
    expect(useRoom.getState().session?.room.questionCount).toBe(15);
    topic(lobbyUpdated(3, view({ questionCount: 20 })));
    expect(useRoom.getState().session?.room.questionCount).toBe(20);
  });

  it('resolves a failed create with the error and keeps no room', async () => {
    const result = createAndOpen();
    await flush();
    socket().deliver(error('INVALID_ROOM_CONFIG'));
    expect(await result).toEqual({ ok: false, error: { code: 'INVALID_ROOM_CONFIG' } });
    expect(useRoom.getState()).toMatchObject({ phase: 'idle', session: null, error: { code: 'INVALID_ROOM_CONFIG' } });
  });

  it('fails a create that gets no answer, and one whose socket never opens', async () => {
    const result = roomClient().create(CONFIG);
    await flush();
    socket().drop();
    expect(await result).toEqual({ ok: false, error: { code: 'CONNECTION' } });
    expect(useRoom.getState().phase).toBe('idle');
    expect(CREATE_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('sends configure for her room and clears `configuring` on the update; an ERROR stays on the lobby', async () => {
    const result = createAndOpen();
    await flush();
    socket().deliver(joined());
    await result;
    roomClient().configure({ questionCount: 15 });
    expect(socket().bodiesTo(roomConfigure(ROOM_ID))).toEqual([{ questionCount: 15 }]);
    expect(useRoom.getState().configuring).toBe(true);
    socket().deliver(error('INVALID_ROOM_CONFIG'));
    expect(useRoom.getState()).toMatchObject({ configuring: false, error: { code: 'INVALID_ROOM_CONFIG' } });
    expect(useRoom.getState().session).not.toBeNull();
    roomClient().configure({ questionCount: 12 });
    expect(useRoom.getState().error).toBeNull();
  });

  it('leave sends leave with no confirm, drops the room and closes the socket', async () => {
    const result = createAndOpen();
    await flush();
    socket().deliver(joined());
    await result;
    roomClient().leave();
    expect(socket().bodiesTo(roomLeave(ROOM_ID))).toHaveLength(1);
    expect(socket().deactivations).toBe(1);
    expect(useRoom.getState()).toMatchObject({ phase: 'idle', session: null, notice: null });
  });

  it('ROOM_CLOSED ends the room with a notice for the Rooms tab', async () => {
    const result = createAndOpen();
    await flush();
    socket().deliver(joined());
    await result;
    socket().deliver(closed('EXPIRED'));
    expect(useRoom.getState()).toMatchObject({ phase: 'idle', session: null, notice: 'EXPIRED' });
    expect(socket().deactivations).toBe(1);
  });

  it('a dropped socket in the lobby is reopened, and the fresh ROOM_JOINED replaces the room', async () => {
    const result = createAndOpen();
    await flush();
    socket().deliver(joined());
    await result;
    const first = socket();
    first.drop();
    expect(useRoom.getState().reconnecting).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await flush();
    expect(clients).toHaveLength(2);
    socket().open();
    expect(socket().subscribed).toEqual([USER_PRIVATE_QUEUE, roomTopic(ROOM_ID)]);
    socket().deliver(joined(view({ questionCount: 12 })));
    expect(useRoom.getState()).toMatchObject({ reconnecting: false, session: { room: { questionCount: 12 } } });
  });

  it('resume finds the room she is still in, and reports none otherwise', async () => {
    const found = roomClient().resume();
    await flush();
    socket().open();
    socket().deliver(joined());
    expect(await found).toBe(true);
    expect(useRoom.getState().phase).toBe('lobby');
  });

  it('closeRealtime (sign-out, account deletion) drops the room, closes the socket and rebuilds the client', async () => {
    const result = createAndOpen();
    await flush();
    socket().deliver(joined());
    await result;
    const before = roomClient();
    closeRealtime();
    expect(useRoom.getState().session).toBeNull();
    expect(socket().deactivations).toBe(1);
    expect(roomClient()).not.toBe(before);
  });
});

describe('joining (Story 5.3)', () => {
  const OTHER = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';
  const member = (room = view({ participants: [...view().participants, { participantId: OTHER, displayName: 'Biju', kind: 'USER' }], humanCount: 2 })) => ({
    ...joined(room),
    payload: { ...joined(room).payload, role: 'MEMBER', selfParticipantId: OTHER },
  });
  const topic = (message: unknown) =>
    (socket() as unknown as { subscriptions: Map<string, (m: { body: string }) => void> }).subscriptions.get(roomTopic(ROOM_ID))!({ body: JSON.stringify(message) });

  async function joinAndOpen() {
    const result = roomClient().join('K7MQ2X');
    await flush();
    socket().open();
    return result;
  }

  it('sends the canonical code after subscribing, and the ROOM_JOINED with that code opens the lobby', async () => {
    const result = joinAndOpen();
    await flush();
    expect(socket().subscribed).toEqual([USER_PRIVATE_QUEUE]);
    expect(socket().bodiesTo(ROOM_JOIN)).toEqual([{ code: 'K7MQ2X' }]);
    expect(useRoom.getState().phase).toBe('joining');
    // A second tap while it is out: the same promise, no second send.
    void roomClient().join('K7MQ2X');
    expect(socket().sentTo(ROOM_JOIN)).toBe(1);
    // Another code while it is out is refused, and never gets this room's answer.
    expect(await roomClient().join('ABC234')).toEqual({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(socket().sentTo(ROOM_JOIN)).toBe(1);
    socket().deliver(member());
    const outcome = await result;
    expect(outcome.ok).toBe(true);
    expect(useRoom.getState()).toMatchObject({ phase: 'lobby', session: { role: 'MEMBER', selfParticipantId: OTHER } });
    expect(socket().subscribed).toContain(roomTopic(ROOM_ID));
  });

  it('resolves a refused join with its code and closes the socket', async () => {
    const result = joinAndOpen();
    await flush();
    socket().deliver(error('ROOM_FULL'));
    expect(await result).toEqual({ ok: false, error: { code: 'ROOM_FULL' } });
    expect(useRoom.getState()).toMatchObject({ phase: 'idle', session: null, error: null });
    expect(socket().deactivations).toBe(1);
  });

  it('holds a lobby frame after a seq gap, sends one resync, and applies the held frames above the fresh ROOM_JOINED', async () => {
    const result = joinAndOpen();
    await flush();
    socket().deliver(member());
    await result;
    const three = view({ humanCount: 3, participants: [...member().payload.room.participants, { participantId: 'c', displayName: 'Chitra', kind: 'USER' }] });
    topic({ ...lobbyUpdated(3, three), payload: { room: three, joined: ['c'], left: [] } });
    expect(useRoom.getState().session?.room.humanCount).toBe(2); // held: seq 2 is missing
    expect(socket().sentTo(roomResync(ROOM_ID))).toBe(1);
    topic(lobbyUpdated(4, three));
    expect(socket().sentTo(roomResync(ROOM_ID))).toBe(1); // one resync for the gap
    // The resync answer reflects seq 2; frames 3 and 4 then apply in order.
    socket().deliver({ ...member(), refSeq: 2 });
    expect(useRoom.getState().session).toMatchObject({ lastSeq: 4, room: { humanCount: 3 } });
  });

  it('records each applied membership change for the chips', async () => {
    const result = joinAndOpen();
    await flush();
    socket().deliver(member());
    await result;
    topic({ ...lobbyUpdated(2), payload: { room: view(), joined: [], left: [OTHER] } });
    expect(useRoom.getState().lobbyEvent).toEqual({ seq: 2, joined: [], left: [OTHER] });
  });

  it('a player whose host left goes back with the host-closed notice naming the host', async () => {
    const result = joinAndOpen();
    await flush();
    socket().deliver(member());
    await result;
    socket().deliver(closed('HOST_DISCONNECTED'));
    expect(useRoom.getState()).toMatchObject({ session: null, notice: 'HOST_CLOSED', noticeHost: 'Anju' });
  });

  it('the host start sends start and keeps the answer', async () => {
    const result = createAndOpen();
    await flush();
    socket().deliver(joined());
    await result;
    roomClient().start();
    expect(socket().sentTo(roomStart(ROOM_ID))).toBe(1);
    expect(useRoom.getState().starting).toBe(true);
    socket().deliver(error('NOT_AVAILABLE_YET', { roomId: ROOM_ID }));
    expect(useRoom.getState()).toMatchObject({ starting: false, startError: { code: 'NOT_AVAILABLE_YET' } });
  });
});
