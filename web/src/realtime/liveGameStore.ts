import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type {
  AnswerResult,
  ErrorCode,
  MatchEndedPayload,
  MatchFoundPayload,
  Participant,
  QuestionRevealedPayload,
  QuestionStartedPayload,
  QuestionSource,
  TopicInfo,
} from './protocol.ts';

/**
 * The live-game store (AD-18). Only the WebSocket module (`connection.ts`) writes it; components
 * read it with `useLiveGame` and act through `joinQuickMatch` (also a Topic Duel, given a topic id) / `cancelMatchmaking`.
 *
 * Phases: `idle` → `searching` (connecting or queued) → `found`, or → `cancelling` → `cancelled`,
 * or → `failed` with a `problem` saying why.
 */
export type LivePhase = 'idle' | 'searching' | 'cancelling' | 'cancelled' | 'found' | 'failed';

export type LiveProblem =
  /** The question set could not be fetched (MATCHMAKING_FAILED). */
  | { kind: 'matchmaking' }
  /** The Topic Duel topic has too few questions now (MATCHMAKING_FAILED TOPIC_UNAVAILABLE). */
  | { kind: 'topicUnavailable' }
  /** The socket could not open, or closed while searching. */
  | { kind: 'connection' }
  /** game-service is restarting (SERVER_DRAINING). */
  | { kind: 'draining' }
  /** Already queued or in a match from another tab or device. */
  | { kind: 'alreadyInMatch'; matchId?: string }
  /** Any other refusal. */
  | { kind: 'rejected'; code: ErrorCode };

/**
 * Where the live match is: `lead-in` (MATCH_FOUND, before Q1) → `open` (QUESTION_STARTED) →
 * `revealed` (QUESTION_REVEALED) → `open` … → `ended` (the reveal of the last question).
 */
export type LiveMatchPhase = 'lead-in' | 'open' | 'revealed' | 'ended';

/**
 * The player's answer to the open question: sent (`pending`) until ANSWER_ACCEPTED (`locked`).
 * `result` is her own result from a 1v1 ack (Story 1.11); null while pending and in Battle Room.
 * Kept in the store so a reconnect SNAPSHOT (Story 1.9) can restore it.
 */
export type MyAnswer = {
  questionIndex: number;
  optionIndex: number;
  status: 'pending' | 'locked';
  result: AnswerResult | null;
};

/**
 * How a match ended for this player (Story 1.9): `forfeited` (the reconnect grace ran out, on the
 * server or on her own ring), `left` (she chose Leave), `aborted` (MATCH_ABORTED: Home with a
 * notice) or `completed` (the last reveal). `scores` are the server's numbers as last seen, in
 * participant order; her own includes an accepted 1v1 answer to the open question.
 */
export type MatchOutcome = {
  kind: 'forfeited' | 'left' | 'aborted' | 'completed';
  scores: { participantId: string; score: number }[];
};

/**
 * The live match (Story 1.8), written only from match messages. Everything a component shows
 * comes from here as the server sent it: no correctness, points or totals are computed.
 */
export type LiveMatch = {
  matchId: string;
  participants: Participant[];
  selfParticipantId: string;
  /** Questions in the match (MATCH_FOUND questionCount). */
  total: number;
  /** MATCH_FOUND's question source; null after a rejoin, whose SNAPSHOT does not carry it (no report link then). */
  questionSource: QuestionSource | null;
  /** The Topic Duel topic (MATCH_FOUND, or a rejoin's SNAPSHOT); absent in Quick Match. */
  topic?: TopicInfo;
  phase: LiveMatchPhase;
  /** The last QUESTION_STARTED payload. */
  question: QuestionStartedPayload | null;
  /** Who has answered the current question (SCOREBOARD), never what. */
  answered: string[];
  myAnswer: MyAnswer | null;
  /** The current question's QUESTION_REVEALED payload, null until it arrives. */
  reveal: QuestionRevealedPayload | null;
  /** participantId → totalScore from the last reveal (0 before the first). */
  totals: Record<string, number>;
  /** The last applied broadcast `seq`; broadcasts at or below it are duplicates. */
  lastSeq: number;
  /** `reconnecting` from the socket dropping mid-match until the SNAPSHOT (Story 1.9). */
  connection: 'live' | 'reconnecting';
  /** While reconnecting: when her grace runs out, in device ms (`Date.now()`); null otherwise. */
  reconnectDeadline: number | null;
  /** Participants who have forfeited (PARTICIPANT_FORFEITED or a SNAPSHOT). */
  forfeited: string[];
  /** How the match ended for her, once it has; null while she is still playing. */
  outcome: MatchOutcome | null;
  /**
   * The MATCH_ENDED payload (Story 1.10): final standings, the asked questions and the breakdown.
   * It may arrive before or after the last reveal, and after her own outcome (a forfeit or Leave).
   */
  ended: MatchEndedPayload | null;
};

/**
 * A rejoin after a page reload (`/match` with no live match but a known match id): `pending`
 * while the SNAPSHOT is awaited, `gone` when the server says she is not in it (NOT_IN_MATCH) or
 * nothing answered in time. Written only by the connection module; cleared once the SNAPSHOT
 * rebuilds the live match.
 */
export type LiveRejoin = { matchId: string; state: 'pending' | 'gone' };

/** A one-line note after a rematch attempt reverted (Story 1.10). */
export type RematchNote = 'expired' | 'cancelled' | 'unavailable' | 'failed' | 'draining' | 'topicUnavailable';

/**
 * The rematch of the ended match `matchId` (Story 1.10), written only from the server's messages
 * and her own sends:
 * - `idle`: nothing pending (with a `note` after a revert);
 * - `starting`: she sent Rematch (or Accept) and waits for the server;
 * - `waiting`: her request is pending until `expiresAt` (REMATCH_REQUESTED by her);
 * - `incoming`: the opponent asked first (REMATCH_REQUESTED by them): her button accepts.
 * The next MATCH_FOUND clears it.
 */
export type RematchState = {
  matchId: string;
  state: 'idle' | 'waiting' | 'incoming' | 'starting';
  /** The pending request's deadline (ISO-8601, server clock), while `waiting` or `incoming`. */
  expiresAt?: string;
  note?: RematchNote;
};

export type LiveGameState = {
  phase: LivePhase;
  /** The last MATCH_FOUND, kept until the next one. */
  match: MatchFoundPayload | null;
  problem: LiveProblem | null;
  /** Server clock minus device clock, from the last message's `serverTime`. */
  clockOffsetMs: number;
  /** The live match, null until MATCH_FOUND; a new MATCH_FOUND replaces it. */
  live: LiveMatch | null;
  /** A rejoin in progress or just failed; null otherwise. */
  rejoin: LiveRejoin | null;
  /** The rematch of the last ended match; null when none was asked for. */
  rematch: RematchState | null;
};

export const INITIAL_LIVE_GAME: LiveGameState = {
  phase: 'idle',
  match: null,
  problem: null,
  clockOffsetMs: 0,
  live: null,
  rejoin: null,
  rematch: null,
};

/** A fresh live match for a MATCH_FOUND. */
export function liveMatchFor(found: MatchFoundPayload): LiveMatch {
  return liveMatchBase({
    matchId: found.matchId,
    participants: found.participants,
    selfParticipantId: found.selfParticipantId,
    total: found.questionCount,
    questionSource: found.questionSource,
    topic: found.topic,
  });
}

/**
 * A fresh live match from who plays and how many questions: the base for MATCH_FOUND, and for a
 * rejoin after a reload, where a SNAPSHOT (participants, total, `selfParticipantId`) is all there is.
 */
export function liveMatchBase(base: {
  matchId: string;
  participants: Participant[];
  selfParticipantId: string;
  total: number;
  questionSource?: QuestionSource;
  topic?: TopicInfo;
}): LiveMatch {
  return {
    matchId: base.matchId,
    participants: base.participants,
    selfParticipantId: base.selfParticipantId,
    total: base.total,
    questionSource: base.questionSource ?? null,
    ...(base.topic && { topic: base.topic }),
    phase: 'lead-in',
    question: null,
    answered: [],
    myAnswer: null,
    reveal: null,
    totals: Object.fromEntries(base.participants.map((p) => [p.participantId, 0])),
    lastSeq: 0,
    connection: 'live',
    reconnectDeadline: null,
    forfeited: [],
    outcome: null,
    ended: null,
  };
}

/** The store itself. Write access is for `connection.ts` only. */
export const liveGameStore = createStore<LiveGameState>(() => INITIAL_LIVE_GAME);

export function useLiveGame<T>(selector: (state: LiveGameState) => T): T {
  return useStore(liveGameStore, selector);
}

export {
  cancelMatchmaking,
  cancelRejoin,
  cancelRematch,
  joinQuickMatch,
  leaveMatch,
  rejoinMatch,
  requestRematch,
  submitAnswer,
} from './connection.ts';
