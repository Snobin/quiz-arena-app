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
  'PARTICIPANT_FORFEITED',
  'MATCH_ABORTED',
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
  'INVALID_TOPIC',
  'PROFILE_REQUIRED',
  'INVALID_ROOM_CONFIG',
  'SOURCE_NOT_AVAILABLE',
  'NOT_HOST',
  'NOT_AVAILABLE_YET',
  'ROOM_NOT_FOUND',
  'ROOM_EXPIRED',
  'ROOM_FULL',
  'ROOM_STARTED',
  'NOT_ENOUGH_PLAYERS',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const MATCH_MODES = ['QUICK', 'TOPIC_DUEL', 'BATTLE_ROOM'] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const PARTICIPANT_KINDS = ['USER', 'GUEST', 'BOT'] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

export const QUESTION_SOURCES = ['BANK', 'CUSTOM'] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];

export const SNAPSHOT_PHASES = ['LEAD_IN', 'QUESTION_OPEN', 'REVEAL', 'ENDED'] as const;
export type SnapshotPhase = (typeof SNAPSHOT_PHASES)[number];

export const ABORT_REASONS = ['ALL_LEFT', 'ERROR'] as const;
export type AbortReason = (typeof ABORT_REASONS)[number];

export const REMATCH_DECLINE_REASONS = ['CANCELLED', 'UNAVAILABLE'] as const;
export type RematchDeclineReason = (typeof REMATCH_DECLINE_REASONS)[number];

export const ROOM_ROLES = ['HOST', 'MEMBER'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

export const ROOM_CLOSED_REASONS = ['HOST_LEFT', 'HOST_DISCONNECTED', 'EXPIRED', 'SERVER_DRAINING', 'MATCH_ENDED'] as const;
export type RoomClosedReason = (typeof ROOM_CLOSED_REASONS)[number];

/** The phase a lobby update reports: open, or `STARTING` while the host's start fetches the question set (Story 5.4). */
export const ROOM_LOBBY_PHASES = ['LOBBY', 'STARTING'] as const;
export type RoomLobbyPhase = (typeof ROOM_LOBBY_PHASES)[number];

/** Why a start did not go ahead (ROOM_START_FAILED). */
export const ROOM_START_FAILED_REASONS = ['TOPIC_UNAVAILABLE', 'UNAVAILABLE'] as const;
export type RoomStartFailedReason = (typeof ROOM_START_FAILED_REASONS)[number];

/** The enum lists by their Java names, as `contracts/samples/enums.json` has them. */
export const ENUMS = {
  MessageType: MESSAGE_TYPES,
  ErrorCode: ERROR_CODES,
  MatchMode: MATCH_MODES,
  ParticipantKind: PARTICIPANT_KINDS,
  QuestionSource: QUESTION_SOURCES,
  SnapshotPhase: SNAPSHOT_PHASES,
  AbortReason: ABORT_REASONS,
  RematchDeclineReason: REMATCH_DECLINE_REASONS,
  RoomRole: ROOM_ROLES,
  RoomClosedReason: ROOM_CLOSED_REASONS,
  RoomLobbyPhase: ROOM_LOBBY_PHASES,
  RoomStartFailedReason: ROOM_START_FAILED_REASONS,
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

/** The Topic Duel topic (Story 4.2); absent in Quick Match. */
export type TopicInfo = { topicId: string; name: string; subjectName: string };

export type MatchFoundPayload = {
  matchId: string;
  mode: MatchMode;
  participants: Participant[];
  questionCount: number;
  questionSource: QuestionSource;
  /** Which participant the receiver is. */
  selfParticipantId: string;
  topic?: TopicInfo;
};

export type MatchmakingFailedPayload = { reason: string };

export type ErrorPayload = { code: ErrorCode; matchId?: string; roomId?: string };

/** A Battle Room's question source (Story 5.1): tagged, so Epic 6 can add `CUSTOM`. Only `BANK` is accepted today. */
export type RoomSource = { type: QuestionSource; topicId?: string };

/** The lobby as `ROOM_JOINED` and `ROOM_LOBBY_UPDATED` show it. Types only: the parsers are in the lazy rooms chunk (`screens/rooms/roomProtocol.ts`). */
export type RoomView = {
  hostParticipantId: string;
  source: RoomSource;
  questionCount: number;
  rated: boolean;
  /** ISO-8601 UTC: the lobby closes then. */
  expiresAt: string;
  participants: Participant[];
  humanCount: number;
};

/** ROOM_JOINED (private, with `refSeq`). `code` is the canonical 6 characters, shown as `XXX-XXX`. */
export type RoomJoinedPayload = { roomId: string; code: string; role: RoomRole; selfParticipantId: string; room: RoomView };

/**
 * ROOM_LOBBY_UPDATED (broadcast on `/topic/room/{roomId}`): the whole lobby, and the participant ids that joined and
 * left since the previous broadcast (Story 5.3; membership changes are coalesced, at most one broadcast per 250 ms).
 */
export type RoomLobbyUpdatedPayload = { room: RoomView; joined: string[]; left: string[]; phase: RoomLobbyPhase };

/** ROOM_START_FAILED (broadcast): the room is back in the lobby. */
export type RoomStartFailedPayload = { reason: RoomStartFailedReason };

/**
 * ROOM_MATCH_STARTED (broadcast on `/topic/room/{roomId}`, Story 5.4): the room's match exists. `firstQuestionAt` is the
 * server instant Q1 opens (and Q1's `startedAt`): every client counts 3-2-1 down to it with the server clock offset.
 */
export type RoomMatchStartedPayload = {
  roomId: string;
  matchId: string;
  mode: MatchMode;
  participants: Participant[];
  questionCount: number;
  topic?: TopicInfo;
  firstQuestionAt: string;
};

/** ROOM_CLOSED (broadcast, and private to each member). */
export type RoomClosedPayload = { reason: RoomClosedReason };

/** Body of `/app/room/create` and `/app/room/{roomId}/configure`. */
export type RoomConfigRequest = { source?: RoomSource; questionCount?: number };

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

/** One participant's standing in a SNAPSHOT. */
export type ParticipantScore = { participantId: string; score: number; forfeited: boolean };

/**
 * Her own accepted answer to the open question, in a SNAPSHOT: the pick always, plus her result
 * in 1v1 modes (all four result fields, or none).
 */
export type SnapshotAnswer = { pickedIndex: number; result: AnswerResult | null };

/**
 * SNAPSHOT (private, with refSeq = the last broadcast seq): the match as it stands, in reply to
 * `resync` (Story 1.9). `question`, `startedAt` and `deadline` only while a question is open;
 * `lastReveal` is the last QUESTION_REVEALED payload. Never another participant's pick, nor the
 * open question's answer or explanation (AD-5), with one exception: her own accepted 1v1 result
 * in `myAnswer`, whose `answerIndex` she already had from ANSWER_ACCEPTED (Story 1.11).
 */
export type SnapshotPayload = {
  phase: SnapshotPhase;
  questionIndex: number;
  total: number;
  question: QuestionView | null;
  startedAt: string | null;
  deadline: string | null;
  lastReveal: QuestionRevealedPayload | null;
  answered: string[];
  scores: ParticipantScore[];
  participants: Participant[];
  youForfeited: boolean;
  myAnswer: SnapshotAnswer | null;
  /** Which participant the receiver is; null from an older server (lets a reloaded client rejoin). */
  selfParticipantId: string | null;
  topic?: TopicInfo;
};

/** PARTICIPANT_FORFEITED (broadcast): a participant left the match (grace ran out, or Leave). */
export type ParticipantForfeitedPayload = { participantId: string; questionIndex: number };

/** MATCH_ABORTED (broadcast): the match ended without results. */
export type MatchAbortedPayload = { reason: AbortReason };

/** One participant's final standing in MATCH_ENDED; `placement` is the server's (shared on a tie: 1, 1, 3). */
export type ResultParticipant = {
  participantId: string;
  displayName: string;
  kind: ParticipantKind;
  score: number;
  correctCount: number;
  forfeited: boolean;
  placement: number;
};

/** An asked question in MATCH_ENDED, answer included. `attribution` is null when absent. */
export type ResultQuestion = {
  questionId: string;
  version: number;
  textMl?: string;
  textEn?: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  attribution: string | null;
  /** The bank topic (Story 4.4); absent for a custom question or an older stored result. */
  topicId?: string;
};

/** One participant's answer to one asked question; `pickedIndex` and `responseMs` are null when she did not answer. */
export type BreakdownAnswer = { pickedIndex: number | null; correct: boolean; responseMs: number | null; points: number };

/** One participant's answers: `answers[i]` is her answer to `questions[i]`. */
export type ParticipantBreakdown = { participantId: string; answers: BreakdownAnswer[] };

/**
 * MATCH_ENDED (private, no seq; Story 1.10): a completed match's standings, the asked questions
 * and every participant's breakdown. Every correctness, point and placement is the server's.
 */
export type MatchEndedPayload = {
  matchId: string;
  mode: MatchMode;
  questionSource: QuestionSource;
  participants: ResultParticipant[];
  questions: ResultQuestion[];
  breakdown: ParticipantBreakdown[];
  topic?: TopicInfo;
  /** A Battle Room's id and host participant (Story 5.5); absent outside rooms. */
  room?: MatchEndedRoom;
};

/** The room block of a MATCH_ENDED (contracts `MatchEndedRoom`). */
export type MatchEndedRoom = { roomId: string; hostParticipantId: string };

/**
 * REMATCH_REQUESTED (private, about the ended match; Story 1.10): a human asked for a rematch.
 * Both humans get it: `requestedBy` is the requester's participant id in the ended match.
 */
export type RematchRequestedPayload = { requestedBy: string; expiresAt: string };

/** REMATCH_DECLINED (private, about the ended match): her rematch state reverts. */
export type RematchDeclinedPayload = { reason: RematchDeclineReason };

/** The client's answer body (`/app/match/{matchId}/answer`). The server stamps the time itself. */
export type AnswerRequest = { questionIndex: number; optionIndex: number };

/** STOMP destinations (contracts `Destinations`). */
export const ENDPOINT_PATH = '/ws';
export const USER_PRIVATE_QUEUE = '/user/queue/game';
export const matchmakingJoin = (mode: MatchMode) => `/app/matchmaking/${mode}/join`;
export const matchmakingCancel = (mode: MatchMode) => `/app/matchmaking/${mode}/cancel`;
export const matchTopic = (matchId: string) => `/topic/match/${matchId}`;
export const matchAnswer = (matchId: string) => `/app/match/${matchId}/answer`;
export const matchResync = (matchId: string) => `/app/match/${matchId}/resync`;
export const matchLeave = (matchId: string) => `/app/match/${matchId}/leave`;
export const matchRematch = (matchId: string) => `/app/match/${matchId}/rematch`;
export const matchRematchCancel = (matchId: string) => `/app/match/${matchId}/rematch/cancel`;

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
export const isSnapshotPhase = oneOf(SNAPSHOT_PHASES);
export const isAbortReason = oneOf(ABORT_REASONS);
export const isRematchDeclineReason = oneOf(REMATCH_DECLINE_REASONS);

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

/** The optional `topic`: undefined when absent, null when malformed. */
export function parseTopic(value: unknown): TopicInfo | undefined | null {
  if (value === undefined) return undefined;
  if (!isObject(value) || !isString(value.topicId) || !isString(value.name) || !isString(value.subjectName)) return null;
  return { topicId: value.topicId, name: value.name, subjectName: value.subjectName };
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
  const topic = parseTopic(value.topic);
  if (topic === null) return null;
  return { matchId, mode, participants: list, questionCount, questionSource, selfParticipantId, ...(topic && { topic }) };
}

export function parseMatchmakingFailed(value: unknown): MatchmakingFailedPayload | null {
  if (!isObject(value) || !isString(value.reason)) return null;
  return { reason: value.reason };
}

export function parseErrorPayload(value: unknown): ErrorPayload | null {
  if (!isObject(value) || !isErrorCode(value.code) || !isOptionalString(value.matchId) || !isOptionalString(value.roomId)) {
    return null;
  }
  const payload: ErrorPayload = { code: value.code };
  if (value.matchId !== undefined) payload.matchId = value.matchId;
  if (value.roomId !== undefined) payload.roomId = value.roomId;
  return payload;
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
  const result = parseResult(value);
  return result === undefined ? null : { questionIndex: value.questionIndex, result };
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

function parseResult(value: Json): AnswerResult | null | undefined {
  const { correct, points, answerIndex, totalScore } = value;
  const present = [correct, points, answerIndex, totalScore].filter((field) => field !== undefined).length;
  if (present === 0) return null;
  // All four or none: a partial result is malformed.
  if (present !== 4) return undefined;
  if (typeof correct !== 'boolean' || !isInt(points) || !isOption(answerIndex) || !isInt(totalScore)) return undefined;
  return { correct, points, answerIndex, totalScore };
}

export function parseParticipantScore(value: unknown): ParticipantScore | null {
  if (!isObject(value)) return null;
  const { participantId, score, forfeited } = value;
  if (!isString(participantId) || !isInt(score) || typeof forfeited !== 'boolean') return null;
  return { participantId, score, forfeited };
}

export function parseSnapshot(value: unknown): SnapshotPayload | null {
  if (!isObject(value)) return null;
  const { phase, questionIndex, total, startedAt, deadline, answered, scores, participants, youForfeited } = value;
  if (!isSnapshotPhase(phase) || !isIndex(questionIndex) || !isInt(total) || questionIndex >= total) return null;
  if (typeof youForfeited !== 'boolean') return null;
  if (!Array.isArray(answered) || !answered.every(isString)) return null;
  if (!Array.isArray(scores) || !Array.isArray(participants)) return null;
  const parsedScores = scores.map(parseParticipantScore);
  const parsedParticipants = participants.map(parseParticipant);
  if (parsedScores.some((s) => s === null) || parsedParticipants.some((p) => p === null)) return null;
  // The open question's fields come together, and only while it is open.
  const open = phase === 'QUESTION_OPEN';
  let question: QuestionView | null = null;
  if (open) {
    question = parseQuestionView(value.question);
    if (!question || !isInstant(startedAt) || !isInstant(deadline)) return null;
  } else if (value.question !== undefined || startedAt !== undefined || deadline !== undefined) {
    return null;
  }
  let lastReveal: QuestionRevealedPayload | null = null;
  if (value.lastReveal !== undefined) {
    lastReveal = parseQuestionRevealed(value.lastReveal);
    if (!lastReveal) return null;
  }
  let myAnswer: SnapshotAnswer | null = null;
  if (value.myAnswer !== undefined) {
    if (!isObject(value.myAnswer) || !isOption(value.myAnswer.pickedIndex)) return null;
    const result = parseResult(value.myAnswer);
    if (result === undefined) return null;
    myAnswer = { pickedIndex: value.myAnswer.pickedIndex, result };
  }
  // Optional on the wire parse (an older sample has none); the server always sets it.
  let selfParticipantId: string | null = null;
  if (value.selfParticipantId !== undefined) {
    if (!isString(value.selfParticipantId)) return null;
    selfParticipantId = value.selfParticipantId;
  }
  const topic = parseTopic(value.topic);
  if (topic === null) return null;
  return {
    phase,
    questionIndex,
    total,
    question,
    startedAt: open ? (startedAt as string) : null,
    deadline: open ? (deadline as string) : null,
    lastReveal,
    answered: [...answered],
    scores: parsedScores as ParticipantScore[],
    participants: parsedParticipants as Participant[],
    youForfeited,
    myAnswer,
    selfParticipantId,
    ...(topic && { topic }),
  };
}

export function parseParticipantForfeited(value: unknown): ParticipantForfeitedPayload | null {
  if (!isObject(value) || !isString(value.participantId) || !isIndex(value.questionIndex)) return null;
  return { participantId: value.participantId, questionIndex: value.questionIndex };
}

export function parseMatchAborted(value: unknown): MatchAbortedPayload | null {
  if (!isObject(value) || !isAbortReason(value.reason)) return null;
  return { reason: value.reason };
}

export function parseResultParticipant(value: unknown): ResultParticipant | null {
  if (!isObject(value)) return null;
  const { participantId, displayName, kind, score, correctCount, forfeited, placement } = value;
  if (!isString(participantId) || !isString(displayName) || !isParticipantKind(kind)) return null;
  if (!isInt(score) || !isIndex(correctCount) || typeof forfeited !== 'boolean' || !isInt(placement) || placement < 1) return null;
  return { participantId, displayName, kind, score, correctCount, forfeited, placement };
}

export function parseResultQuestion(value: unknown): ResultQuestion | null {
  if (!isObject(value)) return null;
  const view = parseQuestionView(value);
  const { answerIndex, explanation, attribution } = value;
  if (!view || !isOption(answerIndex) || !isString(explanation) || !isOptionalString(attribution)) return null;
  const { topicId } = value;
  return { ...view, answerIndex, explanation, attribution: attribution ?? null, ...(isString(topicId) ? { topicId } : {}) };
}

export function parseBreakdownAnswer(value: unknown): BreakdownAnswer | null {
  if (!isObject(value)) return null;
  const { pickedIndex, correct, responseMs, points } = value;
  if (typeof correct !== 'boolean' || !isInt(points)) return null;
  if (pickedIndex !== undefined && !isOption(pickedIndex)) return null;
  if (responseMs !== undefined && !isIndex(responseMs)) return null;
  return { pickedIndex: pickedIndex ?? null, correct, responseMs: responseMs ?? null, points };
}

export function parseMatchEnded(value: unknown): MatchEndedPayload | null {
  if (!isObject(value)) return null;
  const { matchId, mode, questionSource, participants, questions, breakdown } = value;
  if (!isString(matchId) || !isMatchMode(mode) || !isQuestionSource(questionSource)) return null;
  if (!Array.isArray(participants) || !Array.isArray(questions) || !Array.isArray(breakdown)) return null;
  const parsedParticipants = participants.map(parseResultParticipant);
  const parsedQuestions = questions.map(parseResultQuestion);
  if (parsedParticipants.some((p) => p === null) || parsedQuestions.some((q) => q === null)) return null;
  const topic = parseTopic(value.topic);
  if (topic === null) return null;
  let room: MatchEndedRoom | undefined;
  if (value.room !== undefined) {
    if (!isObject(value.room) || !isString(value.room.roomId) || !isString(value.room.hostParticipantId)) return null;
    room = { roomId: value.room.roomId, hostParticipantId: value.room.hostParticipantId };
  }
  const parsedBreakdown: ParticipantBreakdown[] = [];
  for (const entry of breakdown) {
    if (!isObject(entry) || !isString(entry.participantId) || !Array.isArray(entry.answers)) return null;
    // answers[i] lines up with questions[i].
    if (entry.answers.length !== questions.length) return null;
    const answers = entry.answers.map(parseBreakdownAnswer);
    if (answers.some((a) => a === null)) return null;
    parsedBreakdown.push({ participantId: entry.participantId, answers: answers as BreakdownAnswer[] });
  }
  return {
    matchId,
    mode,
    questionSource,
    participants: parsedParticipants as ResultParticipant[],
    questions: parsedQuestions as ResultQuestion[],
    breakdown: parsedBreakdown,
    ...(topic && { topic }),
    ...(room && { room }),
  };
}

export function parseRematchRequested(value: unknown): RematchRequestedPayload | null {
  if (!isObject(value) || !isString(value.requestedBy) || !isInstant(value.expiresAt)) return null;
  return { requestedBy: value.requestedBy, expiresAt: value.expiresAt };
}

export function parseRematchDeclined(value: unknown): RematchDeclinedPayload | null {
  if (!isObject(value) || !isRematchDeclineReason(value.reason)) return null;
  return { reason: value.reason };
}

/** REMATCH_EXPIRED has an empty payload (`{}`); anything but an object is malformed. */
export function parseRematchExpired(value: unknown): Record<string, never> | null {
  return isObject(value) ? {} : null;
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
  | { type: 'SNAPSHOT'; message: ServerMessage; payload: SnapshotPayload }
  | { type: 'PARTICIPANT_FORFEITED'; message: ServerMessage; payload: ParticipantForfeitedPayload }
  | { type: 'MATCH_ABORTED'; message: ServerMessage; payload: MatchAbortedPayload }
  | { type: 'MATCH_ENDED'; message: ServerMessage; payload: MatchEndedPayload }
  | { type: 'REMATCH_REQUESTED'; message: ServerMessage & { matchId: string }; payload: RematchRequestedPayload }
  | { type: 'REMATCH_DECLINED'; message: ServerMessage & { matchId: string }; payload: RematchDeclinedPayload }
  | { type: 'REMATCH_EXPIRED'; message: ServerMessage & { matchId: string } }
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
    case 'SNAPSHOT': {
      const payload = parseSnapshot(message.payload);
      return payload ? { type: 'SNAPSHOT', message, payload } : null;
    }
    case 'PARTICIPANT_FORFEITED': {
      const payload = parseParticipantForfeited(message.payload);
      return payload ? { type: 'PARTICIPANT_FORFEITED', message, payload } : null;
    }
    case 'MATCH_ABORTED': {
      const payload = parseMatchAborted(message.payload);
      return payload ? { type: 'MATCH_ABORTED', message, payload } : null;
    }
    case 'MATCH_ENDED': {
      const payload = parseMatchEnded(message.payload);
      return payload ? { type: 'MATCH_ENDED', message, payload } : null;
    }
    case 'REMATCH_REQUESTED': {
      const payload = parseRematchRequested(message.payload);
      const { matchId } = message;
      return payload && matchId !== undefined ? { type: 'REMATCH_REQUESTED', message: { ...message, matchId }, payload } : null;
    }
    case 'REMATCH_DECLINED': {
      const payload = parseRematchDeclined(message.payload);
      const { matchId } = message;
      return payload && matchId !== undefined ? { type: 'REMATCH_DECLINED', message: { ...message, matchId }, payload } : null;
    }
    case 'REMATCH_EXPIRED': {
      const { matchId } = message;
      return parseRematchExpired(message.payload) && matchId !== undefined
        ? { type: 'REMATCH_EXPIRED', message: { ...message, matchId } }
        : null;
    }
    default:
      return { type: 'OTHER', message };
  }
}
