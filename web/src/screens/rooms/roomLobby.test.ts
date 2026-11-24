import { describe, expect, it } from 'vitest';
import type { RoomView } from '../../realtime/protocol.ts';
import type { RoomIncoming } from './roomProtocol.ts';
import { hostName, lobbyUpdate, NOTICES, sameConfig } from './roomLobby.ts';
import type { RoomSession } from './roomStore.ts';

const room = (over: Partial<RoomView> = {}): RoomView =>
  ({
    questionCount: 10,
    source: { type: 'BANK', topicId: 't1' },
    hostParticipantId: 'p1',
    participants: [
      { participantId: 'p1', displayName: 'Anju' },
      { participantId: 'p2', displayName: 'Biju' },
    ],
    ...over,
  }) as RoomView;

const session = (r: RoomView = room()): RoomSession => ({ room: r, lastSeq: 4, roomId: 'r1', role: 'HOST', selfParticipantId: 'p1' }) as RoomSession;

const lobbyFrame = (r: RoomView, extra: Record<string, unknown> = {}) =>
  ({ type: 'ROOM_LOBBY_UPDATED', message: { seq: 5 }, payload: { room: r, joined: [], left: [], phase: 'LOBBY', ...extra } }) as unknown as Extract<RoomIncoming, { type: 'ROOM_LOBBY_UPDATED' }>;

describe('hostName and NOTICES', () => {
  it('names the host, or nothing without a session or a host', () => {
    expect(hostName(session())).toBe('Anju');
    expect(hostName(null)).toBeNull();
    expect(hostName(session(room({ hostParticipantId: 'gone' })))).toBeNull();
  });

  it('reads every close reason as a notice', () => {
    expect(NOTICES.HOST_LEFT).toBe('CLOSED');
    expect(NOTICES.HOST_DISCONNECTED).toBe('DISCONNECTED');
    expect(NOTICES.SERVER_DRAINING).toBe('DRAINING');
    expect(NOTICES.EXPIRED).toBe('EXPIRED');
    expect(NOTICES.MATCH_ENDED).toBe('CLOSED');
  });
});

describe('sameConfig', () => {
  it('matches a bank lobby by count and topic', () => {
    const request = { questionCount: 10, source: { type: 'BANK', topicId: 't1' } } as never;
    expect(sameConfig(request, room())).toBe(true);
    expect(sameConfig(request, room({ questionCount: 12 }))).toBe(false);
    expect(sameConfig(request, room({ source: { type: 'BANK', topicId: 't2' } as never }))).toBe(false);
    expect(sameConfig(request, room({ source: { type: 'CUSTOM', customTopicId: 'c1' } as never }))).toBe(false);
  });

  it('matches a custom lobby by id, or any custom lobby when a play again names none', () => {
    const named = { questionCount: 10, source: { type: 'CUSTOM', customTopicId: 'c1' } } as never;
    const unnamed = { questionCount: 10, source: { type: 'CUSTOM' } } as never;
    const custom = (id: string) => room({ source: { type: 'CUSTOM', customTopicId: id } as never });
    expect(sameConfig(named, custom('c1'))).toBe(true);
    expect(sameConfig(named, custom('c2'))).toBe(false);
    expect(sameConfig(unnamed, custom('anything'))).toBe(true);
    expect(sameConfig(unnamed, room())).toBe(false);
  });
});

describe('lobbyUpdate', () => {
  it('a membership-only frame leaves an open configure and its error alone', () => {
    const update = lobbyUpdate(session(), true, lobbyFrame(room(), { joined: [{ participantId: 'p3' }] }));
    expect(update.clearConfigureTimer).toBe(false);
    expect(update.patch).not.toHaveProperty('configuring');
    expect(update.patch.lobbyEvent).toEqual({ seq: 5, joined: [{ participantId: 'p3' }], left: [] });
  });

  it('a frame with no change in membership closes an open configure and clears its error', () => {
    const update = lobbyUpdate(session(), true, lobbyFrame(room()));
    expect(update.clearConfigureTimer).toBe(true);
    expect(update.patch).toMatchObject({ configuring: false, error: null });
  });

  it('a new count or topic closes the configure and clears the too-few-questions line', () => {
    const update = lobbyUpdate(session(), false, lobbyFrame(room({ questionCount: 15 }), { joined: [{ participantId: 'p3' }] }));
    expect(update.clearConfigureTimer).toBe(false); // none was open
    expect(update.patch).toMatchObject({ configuring: false, error: null, startFailure: null });
  });

  it('STARTING answers the start in flight', () => {
    const update = lobbyUpdate(session(), false, lobbyFrame(room(), { phase: 'STARTING' }));
    expect(update.clearStartTimer).toBe(true);
    expect(update.patch).toMatchObject({ starting: false, startError: null, startFailure: null, lobbyPhase: 'STARTING' });
  });

  it('carries the frame seq into the session, or keeps the last one', () => {
    expect(lobbyUpdate(session(), false, lobbyFrame(room())).patch.session?.lastSeq).toBe(5);
    const unnumbered = { ...lobbyFrame(room()), message: {} } as never;
    expect(lobbyUpdate(session(), false, unnumbered).patch.session?.lastSeq).toBe(4);
  });
});
