/**
 * The real-time protocol (AD-10), mirroring `contracts/src/main/java/in/minnal/contracts/realtime`.
 * Types plus runtime parsers: nothing from the socket is trusted until a parser accepts it.
 * `contract.test.ts` runs these parsers over the golden samples that `contracts` generates, and
 * checks the enum lists below against `contracts/samples/enums.json`.
 */

export const MESSAGE_TYPES = [
  'MATCH_FOUND',
  'MATCHMAKING_FAILED',
  'MATCHMAKING_CANCELLED',
  'QUESTION_STARTED',
  'ANSWER_ACCEPTED',
  'SCOREBOARD',
  'QUESTION_REVEALED',
  'MATCH_ENDED',
  'SNAPSHOT',
  'REMATCH_REQUESTED',
  'REMATCH_ACCEPTED',
  'REMATCH_DECLINED',
  'REMATCH_EXPIRED',
  'ROOM_JOINED',
  'ROOM_LOBBY_UPDATED',
  'ROOM_CLOSED',
  'ROOM_START_FAILED',
  'ROOM_MATCH_STARTED',
  'ROOM_SUCCEEDED',
  'ERROR',
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'ALREADY_IN_MATCH',
  'SERVER_DRAINING',
  'RATE_LIMITED',
  'FORBIDDEN_MODE',
  'MODE_UNAVAILABLE',
  'CANCEL_REJECTED',
  'NOT_IN_QUEUE',
  'BAD_REQUEST',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const MATCH_MODES = ['QUICK', 'TOPIC_DUEL', 'BATTLE_ROOM'] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const PARTICIPANT_KINDS = ['USER', 'GUEST', 'BOT'] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

export const QUESTION_SOURCES = ['BANK', 'CUSTOM'] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

/** The enum lists by their Java names, as `contracts/samples/enums.json` has them. */
export const ENUMS = {
  MessageType: MESSAGE_TYPES,
  ErrorCode: ERROR_CODES,
  MatchMode: MATCH_MODES,
  ParticipantKind: PARTICIPANT_KINDS,
  QuestionSource: QUESTION_SOURCES,
} as const;

/** The envelope: `{type, matchId?, roomId?, seq?, refSeq?, serverTime, payload?}`. */
export type ServerMessage<P = unknown> = {
  type: MessageType;
  matchId?: string;
  roomId?: string;
  seq?: number;
  refSeq?: number;
  /** ISO-8601 UTC. */
  serverTime: string;
  payload?: P;
};

export type Participant = { participantId: string; displayName: string; kind: ParticipantKind };

export type MatchFoundPayload = {
  matchId: string;
  mode: MatchMode;
  participants: Participant[];
  questionCount: number;
  questionSource: QuestionSource;
  /** Which participant the receiver is. */
  selfParticipantId: string;
};

export type MatchmakingFailedPayload = { reason: string };

export type ErrorPayload = { code: ErrorCode; matchId?: string };

/** STOMP destinations (contracts `Destinations`). */
export const ENDPOINT_PATH = '/ws';
export const USER_PRIVATE_QUEUE = '/user/queue/game';
export const matchmakingJoin = (mode: MatchMode) => `/app/matchmaking/${mode}/join`;
export const matchmakingCancel = (mode: MatchMode) => `/app/matchmaking/${mode}/cancel`;

// ---------------------------------------------------------------------------------------------
// Runtime parsers: return the typed value, or null when the input does not have the shape.

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isOptionalString = (value: unknown): value is string | undefined => value === undefined || isString(value);
const isOptionalInt = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === 'number' && Number.isInteger(value));
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    (values as readonly unknown[]).includes(value);

export const isMessageType = oneOf(MESSAGE_TYPES);
export const isErrorCode = oneOf(ERROR_CODES);
export const isMatchMode = oneOf(MATCH_MODES);
export const isParticipantKind = oneOf(PARTICIPANT_KINDS);
export const isQuestionSource = oneOf(QUESTION_SOURCES);

/** The envelope, with `payload` left unparsed (see the payload parsers). */
export function parseServerMessage(value: unknown): ServerMessage | null {
  if (!isObject(value)) return null;
  const { type, matchId, roomId, seq, refSeq, serverTime, payload } = value;
  if (!isMessageType(type) || !isString(serverTime) || !Number.isFinite(Date.parse(serverTime))) return null;
  if (!isOptionalString(matchId) || !isOptionalString(roomId) || !isOptionalInt(seq) || !isOptionalInt(refSeq)) return null;
  const message: ServerMessage = { type, serverTime };
  if (matchId !== undefined) message.matchId = matchId;
  if (roomId !== undefined) message.roomId = roomId;
  if (seq !== undefined) message.seq = seq;
  if (refSeq !== undefined) message.refSeq = refSeq;
  if (payload !== undefined) message.payload = payload;
  return message;
}

export function parseParticipant(value: unknown): Participant | null {
  if (!isObject(value)) return null;
  const { participantId, displayName, kind } = value;
  if (!isString(participantId) || !isString(displayName) || !isParticipantKind(kind)) return null;
  return { participantId, displayName, kind };
}

export function parseMatchFound(value: unknown): MatchFoundPayload | null {
  if (!isObject(value)) return null;
  const { matchId, mode, participants, questionCount, questionSource, selfParticipantId } = value;
  if (!isString(matchId) || !isMatchMode(mode) || !isQuestionSource(questionSource) || !isString(selfParticipantId)) {
    return null;
  }
  if (typeof questionCount !== 'number' || !Number.isInteger(questionCount) || !Array.isArray(participants)) return null;
  const parsed = participants.map(parseParticipant);
  if (parsed.some((p) => p === null)) return null;
  const list = parsed as Participant[];
  if (!list.some((p) => p.participantId === selfParticipantId)) return null;
  return { matchId, mode, participants: list, questionCount, questionSource, selfParticipantId };
}

export function parseMatchmakingFailed(value: unknown): MatchmakingFailedPayload | null {
  if (!isObject(value) || !isString(value.reason)) return null;
  return { reason: value.reason };
}

export function parseErrorPayload(value: unknown): ErrorPayload | null {
  if (!isObject(value) || !isErrorCode(value.code) || !isOptionalString(value.matchId)) return null;
  return value.matchId === undefined ? { code: value.code } : { code: value.code, matchId: value.matchId };
}

/** A frame body the client acts on. Anything else (unknown type, bad shape) is null. */
export type Incoming =
  | { type: 'MATCH_FOUND'; message: ServerMessage; payload: MatchFoundPayload }
  | { type: 'MATCHMAKING_FAILED'; message: ServerMessage; payload: MatchmakingFailedPayload }
  | { type: 'MATCHMAKING_CANCELLED'; message: ServerMessage }
  | { type: 'ERROR'; message: ServerMessage; payload: ErrorPayload }
  | { type: 'OTHER'; message: ServerMessage };

/** Parses a frame body (JSON text) into what the client acts on. */
export function parseIncoming(body: string): Incoming | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const message = parseServerMessage(json);
  if (!message) return null;
  switch (message.type) {
    case 'MATCH_FOUND': {
      const payload = parseMatchFound(message.payload);
      return payload ? { type: 'MATCH_FOUND', message, payload } : null;
    }
    case 'MATCHMAKING_FAILED': {
      const payload = parseMatchmakingFailed(message.payload);
      return payload ? { type: 'MATCHMAKING_FAILED', message, payload } : null;
    }
    case 'MATCHMAKING_CANCELLED':
      return { type: 'MATCHMAKING_CANCELLED', message };
    case 'ERROR': {
      const payload = parseErrorPayload(message.payload);
      return payload ? { type: 'ERROR', message, payload } : null;
    }
    default:
      return { type: 'OTHER', message };
  }
}
