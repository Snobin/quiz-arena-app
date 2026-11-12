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
  'NOT_IN_MATCH',
  'ANSWER_REJECTED',
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

/** An open question: no answer, explanation or attribution (AD-5). At least one text is present. */
export type QuestionView = {
  questionId: string;
  version: number;
  textMl?: string;
  textEn?: string;
  options: string[];
};

/** QUESTION_STARTED (broadcast). `questionIndex` is 0-based; instants are ISO-8601 UTC. */
export type QuestionStartedPayload = {
  questionIndex: number;
  total: number;
  startedAt: string;
  deadline: string;
  question: QuestionView;
};

/**
 * The answering player's own result, carried by ANSWER_ACCEPTED in 1v1 modes (Quick Match, Topic
 * Duel; Story 1.11): whether she was right, her points, the question's answer and her total
 * including these points. Every number is the server's.
 */
export type AnswerResult = { correct: boolean; points: number; answerIndex: number; totalScore: number };

/**
 * ANSWER_ACCEPTED (private, with refSeq). In Battle Room a receipt only (`result` null); in 1v1
 * modes it also carries her own `result` (all four fields on the wire, or none).
 */
export type AnswerAcceptedPayload = { questionIndex: number; result: AnswerResult | null };

/** SCOREBOARD (broadcast): who has answered the open question, in answer order. */
export type ScoreboardPayload = { questionIndex: number; answered: string[] };

/** One participant's outcome on a revealed question; `pickedIndex` is null when she did not answer. */
export type ParticipantResult = {
  participantId: string;
  pickedIndex: number | null;
  correct: boolean;
  points: number;
  totalScore: number;
};

/** QUESTION_REVEALED (broadcast). `attribution` is null when absent ("source not available"). */
export type QuestionRevealedPayload = {
  questionIndex: number;
  total: number;
  questionId: string;
  version: number;
  answerIndex: number;
  explanation: string;
  attribution: string | null;
  results: ParticipantResult[];
};

/** The client's answer body (`/app/match/{matchId}/answer`). The server stamps the time itself. */
export type AnswerRequest = { questionIndex: number; optionIndex: number };

/** STOMP destinations (contracts `Destinations`). */
export const ENDPOINT_PATH = '/ws';
export const USER_PRIVATE_QUEUE = '/user/queue/game';
export const matchmakingJoin = (mode: MatchMode) => `/app/matchmaking/${mode}/join`;
export const matchmakingCancel = (mode: MatchMode) => `/app/matchmaking/${mode}/cancel`;
export const matchTopic = (matchId: string) => `/topic/match/${matchId}`;
export const matchAnswer = (matchId: string) => `/app/match/${matchId}/answer`;

// ---------------------------------------------------------------------------------------------
// Runtime parsers: return the typed value, or null when the input does not have the shape.

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isOptionalString = (value: unknown): value is string | undefined => value === undefined || isString(value);
const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
const isOptionalInt = (value: unknown): value is number | undefined => value === undefined || isInt(value);
const isInstant = (value: unknown): value is string => isString(value) && Number.isFinite(Date.parse(value));
const isIndex = (value: unknown): value is number => isInt(value) && value >= 0;
const isOption = (value: unknown): value is number => isInt(value) && value >= 0 && value <= 3;
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

export function parseQuestionView(value: unknown): QuestionView | null {
  if (!isObject(value)) return null;
  const { questionId, version, textMl, textEn, options } = value;
  if (!isString(questionId) || !isInt(version) || !isOptionalString(textMl) || !isOptionalString(textEn)) return null;
  if (textMl === undefined && textEn === undefined) return null;
  if (!Array.isArray(options) || options.length !== 4 || !options.every(isString)) return null;
  const view: QuestionView = { questionId, version, options: [...options] };
  if (textMl !== undefined) view.textMl = textMl;
  if (textEn !== undefined) view.textEn = textEn;
  return view;
}

export function parseQuestionStarted(value: unknown): QuestionStartedPayload | null {
  if (!isObject(value)) return null;
  const { questionIndex, total, startedAt, deadline } = value;
  if (!isIndex(questionIndex) || !isInt(total) || questionIndex >= total) return null;
  if (!isInstant(startedAt) || !isInstant(deadline)) return null;
  const question = parseQuestionView(value.question);
  if (!question) return null;
  return { questionIndex, total, startedAt, deadline, question };
}

export function parseAnswerAccepted(value: unknown): AnswerAcceptedPayload | null {
  if (!isObject(value) || !isIndex(value.questionIndex)) return null;
  const { questionIndex, correct, points, answerIndex, totalScore } = value;
  const present = [correct, points, answerIndex, totalScore].filter((field) => field !== undefined).length;
  if (present === 0) return { questionIndex, result: null };
  // All four or none: a partial result is malformed.
  if (present !== 4) return null;
  if (typeof correct !== 'boolean' || !isInt(points) || !isOption(answerIndex) || !isInt(totalScore)) return null;
  return { questionIndex, result: { correct, points, answerIndex, totalScore } };
}

export function parseScoreboard(value: unknown): ScoreboardPayload | null {
  if (!isObject(value)) return null;
  const { questionIndex, answered } = value;
  if (!isIndex(questionIndex) || !Array.isArray(answered) || !answered.every(isString)) return null;
  return { questionIndex, answered: [...answered] };
}

export function parseParticipantResult(value: unknown): ParticipantResult | null {
  if (!isObject(value)) return null;
  const { participantId, pickedIndex, correct, points, totalScore } = value;
  if (!isString(participantId) || typeof correct !== 'boolean' || !isInt(points) || !isInt(totalScore)) return null;
  if (pickedIndex !== undefined && !isOption(pickedIndex)) return null;
  return { participantId, pickedIndex: pickedIndex ?? null, correct, points, totalScore };
}

export function parseQuestionRevealed(value: unknown): QuestionRevealedPayload | null {
  if (!isObject(value)) return null;
  const { questionIndex, total, questionId, version, answerIndex, explanation, attribution, results } = value;
  if (!isIndex(questionIndex) || !isInt(total) || questionIndex >= total) return null;
  if (!isString(questionId) || !isInt(version) || !isOption(answerIndex) || !isString(explanation)) return null;
  if (!isOptionalString(attribution) || !Array.isArray(results)) return null;
  const parsed = results.map(parseParticipantResult);
  if (parsed.some((r) => r === null)) return null;
  return {
    questionIndex,
    total,
    questionId,
    version,
    answerIndex,
    explanation,
    attribution: attribution ?? null,
    results: parsed as ParticipantResult[],
  };
}

/** A frame body the client acts on. Anything else (unknown type, bad shape) is null. */
export type Incoming =
  | { type: 'MATCH_FOUND'; message: ServerMessage; payload: MatchFoundPayload }
  | { type: 'MATCHMAKING_FAILED'; message: ServerMessage; payload: MatchmakingFailedPayload }
  | { type: 'MATCHMAKING_CANCELLED'; message: ServerMessage }
  | { type: 'QUESTION_STARTED'; message: ServerMessage; payload: QuestionStartedPayload }
  | { type: 'ANSWER_ACCEPTED'; message: ServerMessage; payload: AnswerAcceptedPayload }
  | { type: 'SCOREBOARD'; message: ServerMessage; payload: ScoreboardPayload }
  | { type: 'QUESTION_REVEALED'; message: ServerMessage; payload: QuestionRevealedPayload }
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
    case 'QUESTION_STARTED': {
      const payload = parseQuestionStarted(message.payload);
      return payload ? { type: 'QUESTION_STARTED', message, payload } : null;
    }
    case 'ANSWER_ACCEPTED': {
      const payload = parseAnswerAccepted(message.payload);
      return payload ? { type: 'ANSWER_ACCEPTED', message, payload } : null;
    }
    case 'SCOREBOARD': {
      const payload = parseScoreboard(message.payload);
      return payload ? { type: 'SCOREBOARD', message, payload } : null;
    }
    case 'QUESTION_REVEALED': {
      const payload = parseQuestionRevealed(message.payload);
      return payload ? { type: 'QUESTION_REVEALED', message, payload } : null;
    }
    case 'ERROR': {
      const payload = parseErrorPayload(message.payload);
      return payload ? { type: 'ERROR', message, payload } : null;
    }
    default:
      return { type: 'OTHER', message };
  }
}
