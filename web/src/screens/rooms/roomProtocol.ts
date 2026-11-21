import {
  parseErrorPayload,
  parseParticipant,
  parseServerMessage,
  ROOM_CLOSED_REASONS,
  ROOM_ROLES,
  type ErrorPayload,
  type Participant,
  type RoomClosedPayload,
  type RoomConfigRequest,
  type RoomJoinedPayload,
  type RoomLobbyUpdatedPayload,
  type RoomView,
  type ServerMessage,
} from '../../realtime/protocol.ts';

/**
 * The room half of the real-time protocol (Story 5.2): destinations and runtime parsers. They live here, in the
 * lazy rooms chunk, and not in `realtime/protocol.ts`, so the entry chunk carries no room parsing. Types stay in
 * `protocol.ts`. Nothing from the socket is trusted until a parser here accepts it.
 */

export const ROOM_CREATE = '/app/room/create';
export const ROOM_JOIN = '/app/room/join';
export const roomStart = (roomId: string) => `/app/room/${roomId}/start`;
export const roomResync = (roomId: string) => `/app/room/${roomId}/resync`;
export const roomConfigure = (roomId: string) => `/app/room/${roomId}/configure`;
export const roomLeave = (roomId: string) => `/app/room/${roomId}/leave`;
export const roomTopic = (roomId: string) => `/topic/room/${roomId}`;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

export function parseRoomView(value: unknown): RoomView | null {
  if (!isObject(value)) return null;
  const { hostParticipantId, source, questionCount, rated, expiresAt, participants, humanCount } = value;
  if (typeof hostParticipantId !== 'string' || !isObject(source) || !isInt(questionCount) || typeof rated !== 'boolean') return null;
  if (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)) || !Array.isArray(participants) || !isInt(humanCount)) return null;
  if (typeof source.type !== 'string' || (source.topicId !== undefined && typeof source.topicId !== 'string')) return null;
  if (source.type !== 'BANK' && source.type !== 'CUSTOM') return null;
  const parsed = participants.map(parseParticipant);
  if (parsed.some((p) => p === null)) return null;
  return {
    hostParticipantId,
    source: { type: source.type, ...(source.topicId !== undefined && { topicId: source.topicId }) },
    questionCount,
    rated,
    expiresAt,
    participants: parsed as Participant[],
    humanCount,
  };
}

export function parseRoomJoined(value: unknown): RoomJoinedPayload | null {
  if (!isObject(value)) return null;
  const { roomId, code, role, selfParticipantId } = value;
  if (typeof roomId !== 'string' || typeof code !== 'string' || typeof selfParticipantId !== 'string') return null;
  if (!(ROOM_ROLES as readonly unknown[]).includes(role)) return null;
  const room = parseRoomView(value.room);
  if (!room) return null;
  return { roomId, code, role: role as RoomJoinedPayload['role'], selfParticipantId, room };
}

const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.every((id) => typeof id === 'string');

/** `joined` and `left` (Story 5.3) read as empty when absent; anything else in them rejects the frame. */
export function parseRoomLobbyUpdated(value: unknown): RoomLobbyUpdatedPayload | null {
  if (!isObject(value)) return null;
  const room = parseRoomView(value.room);
  const joined = value.joined ?? [];
  const left = value.left ?? [];
  if (!room || !isIdList(joined) || !isIdList(left)) return null;
  return { room, joined, left };
}

export function parseRoomClosed(value: unknown): RoomClosedPayload | null {
  if (!isObject(value) || !(ROOM_CLOSED_REASONS as readonly unknown[]).includes(value.reason)) return null;
  return { reason: value.reason as RoomClosedPayload['reason'] };
}

/** What the room client acts on; everything else the server may send is `OTHER` and ignored. */
export type RoomIncoming =
  | { type: 'ROOM_JOINED'; message: ServerMessage; payload: RoomJoinedPayload }
  | { type: 'ROOM_LOBBY_UPDATED'; message: ServerMessage; payload: RoomLobbyUpdatedPayload }
  | { type: 'ROOM_CLOSED'; message: ServerMessage; payload: RoomClosedPayload }
  | { type: 'ERROR'; message: ServerMessage; payload: ErrorPayload }
  | { type: 'OTHER'; message: ServerMessage };

/** Parses a frame body (JSON text); null when it is not a well-formed message. */
export function parseRoomIncoming(body: string): RoomIncoming | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const message = parseServerMessage(json);
  if (!message) return null;
  switch (message.type) {
    case 'ROOM_JOINED': {
      const payload = parseRoomJoined(message.payload);
      return payload ? { type: 'ROOM_JOINED', message, payload } : null;
    }
    case 'ROOM_LOBBY_UPDATED': {
      const payload = parseRoomLobbyUpdated(message.payload);
      return payload ? { type: 'ROOM_LOBBY_UPDATED', message, payload } : null;
    }
    case 'ROOM_CLOSED': {
      const payload = parseRoomClosed(message.payload);
      return payload ? { type: 'ROOM_CLOSED', message, payload } : null;
    }
    case 'ERROR': {
      const payload = parseErrorPayload(message.payload);
      return payload ? { type: 'ERROR', message, payload } : null;
    }
    default:
      return { type: 'OTHER', message };
  }
}

/** The body of a join request: the canonical code. */
export function joinBody(code: string): string {
  return JSON.stringify({ code });
}

/** The body of a create or configure request. */
export function configBody(config: RoomConfigRequest): string {
  return JSON.stringify(config);
}
