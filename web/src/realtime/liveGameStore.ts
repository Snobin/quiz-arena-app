import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type {
  AnswerResult,
  ErrorCode,
  MatchFoundPayload,
  Participant,
  QuestionRevealedPayload,
  QuestionStartedPayload,
} from './protocol.ts';

/**
 * The live-game store (AD-18). Only the WebSocket module (`connection.ts`) writes it; components
 * read it with `useLiveGame` and act through `joinQuickMatch` / `cancelMatchmaking`.
 *
 * Phases: `idle` → `searching` (connecting or queued) → `found`, or → `cancelling` → `cancelled`,
 * or → `failed` with a `problem` saying why.
 */
export type LivePhase = 'idle' | 'searching' | 'cancelling' | 'cancelled' | 'found' | 'failed';

export type LiveProblem =
  /** The question set could not be fetched (MATCHMAKING_FAILED). */
  | { kind: 'matchmaking' }
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
 * The live match (Story 1.8), written only from match messages. Everything a component shows
 * comes from here as the server sent it: no correctness, points or totals are computed.
 */
export type LiveMatch = {
  matchId: string;
  participants: Participant[];
  selfParticipantId: string;
  /** Questions in the match (MATCH_FOUND questionCount). */
  total: number;
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
};

export const INITIAL_LIVE_GAME: LiveGameState = {
  phase: 'idle',
  match: null,
  problem: null,
  clockOffsetMs: 0,
  live: null,
};

/** A fresh live match for a MATCH_FOUND. */
export function liveMatchFor(found: MatchFoundPayload): LiveMatch {
  return {
    matchId: found.matchId,
    participants: found.participants,
    selfParticipantId: found.selfParticipantId,
    total: found.questionCount,
    phase: 'lead-in',
    question: null,
    answered: [],
    myAnswer: null,
    reveal: null,
    totals: Object.fromEntries(found.participants.map((p) => [p.participantId, 0])),
    lastSeq: 0,
  };
}

/** The store itself. Write access is for `connection.ts` only. */
export const liveGameStore = createStore<LiveGameState>(() => INITIAL_LIVE_GAME);

export function useLiveGame<T>(selector: (state: LiveGameState) => T): T {
  return useStore(liveGameStore, selector);
}

export { cancelMatchmaking, joinQuickMatch, submitAnswer } from './connection.ts';
