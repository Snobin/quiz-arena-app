import type { RoomClosedReason, RoomConfigRequest, RoomView } from '../../realtime/protocol.ts';
import type { RoomIncoming } from './roomProtocol.ts';
import type { RoomNotice, RoomSession, RoomState } from './roomStore.ts';

/**
 * The pure parts of the room client: what a lobby broadcast changes, how a closed room reads to the player, and whether a
 * lobby answers the create that was sent. No socket, no timers, no store: `roomClient.ts` applies what these return.
 */

/** The broadcasts on the room topic: numbered by one `seq`, applied in order. */
export type Ordered = Extract<RoomIncoming, { type: 'ROOM_LOBBY_UPDATED' | 'ROOM_START_FAILED' | 'ROOM_MATCH_STARTED' }>;

/** How each reason a room closed reads on the Rooms tab. */
export const NOTICES: Record<RoomClosedReason, RoomNotice> = {
  EXPIRED: 'EXPIRED',
  HOST_LEFT: 'CLOSED',
  HOST_DISCONNECTED: 'DISCONNECTED',
  SERVER_DRAINING: 'DRAINING',
  // Never sent to a player (she is in the match by then); read as a plain close should one arrive.
  MATCH_ENDED: 'CLOSED',
};

/** The host's display name, for the "host closed the room" notice. */
export function hostName(session: RoomSession | null): string | null {
  return session?.room.participants.find((p) => p.participantId === session.room.hostParticipantId)?.displayName ?? null;
}

/** Whether `room` is the lobby that `request` (a create or a play again) asked for. */
export function sameConfig(request: Required<RoomConfigRequest>, room: RoomView): boolean {
  if (room.questionCount !== request.questionCount) return false;
  if (request.source.type === 'CUSTOM') {
    // A play again names no id (the server keeps the old source): any custom room with that count is the successor.
    return room.source.type === 'CUSTOM' && (request.source.customTopicId === undefined || room.source.customTopicId === request.source.customTopicId);
  }
  return room.source.type !== 'CUSTOM' && room.source.topicId === request.source.topicId;
}

/** What one `ROOM_LOBBY_UPDATED` changes: the state patch, and which pending timers the frame answers. */
export type LobbyUpdate = { patch: Partial<RoomState>; clearStartTimer: boolean; clearConfigureTimer: boolean };

export function lobbyUpdate(
  session: RoomSession,
  configuring: boolean,
  incoming: Extract<RoomIncoming, { type: 'ROOM_LOBBY_UPDATED' }>,
): LobbyUpdate {
  const seq = incoming.message.seq ?? session.lastSeq;
  const { room, joined, left, phase } = incoming.payload;
  const before = session.room;
  const configChanged =
    before.questionCount !== room.questionCount ||
    before.source.topicId !== room.source.topicId ||
    before.source.customTopicId !== room.source.customTopicId;
  const patch: Partial<RoomState> = {
    session: { ...session, room, lastSeq: seq },
    lobbyEvent: { seq, joined, left },
    lobbyPhase: phase,
  };
  let clearStartTimer = false;
  let clearConfigureTimer = false;
  if (phase === 'STARTING') {
    // Her own start (or the host's, for a player) is under way: nothing is waiting on an answer any more.
    clearStartTimer = true;
    Object.assign(patch, { starting: false, startError: null, startFailure: null });
  }
  // A membership-only frame neither closes an open configure nor clears its inline error.
  if (configChanged || (joined.length === 0 && left.length === 0)) {
    clearConfigureTimer = configuring;
    Object.assign(patch, { configuring: false, error: null });
  }
  // A new topic or count answers the "too few questions" line.
  if (configChanged) Object.assign(patch, { startFailure: null });
  return { patch, clearStartTimer, clearConfigureTimer };
}
