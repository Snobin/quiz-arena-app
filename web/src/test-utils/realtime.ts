import type { IFrame, StompConfig } from '@stomp/stompjs';
import { configureRealtimeForTests, type RealtimeClient } from '../realtime/connection.ts';
import { matchTopic, USER_PRIVATE_QUEUE, type ParticipantKind } from '../realtime/protocol.ts';

/** A scripted stand-in for the stompjs Client: the test opens, refuses, drops and delivers. */
export class FakeStomp implements RealtimeClient {
  connected = false;
  activations = 0;
  deactivations = 0;
  readonly published: { destination: string; body?: string }[] = [];
  /** Every SUBSCRIBE and UNSUBSCRIBE destination, in order. */
  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];
  private readonly subscriptions = new Map<string, (message: { body: string }) => void>();

  constructor(readonly config: StompConfig) {}

  activate(): void {
    this.activations++;
  }

  deactivate(): void {
    this.deactivations++;
    this.connected = false;
  }

  publish(params: { destination: string; body?: string }): void {
    this.published.push(params);
  }

  subscribe(destination: string, callback: (message: { body: string }) => void) {
    this.subscriptions.set(destination, callback);
    this.subscribed.push(destination);
    return {
      unsubscribe: () => {
        this.unsubscribed.push(destination);
        if (this.subscriptions.get(destination) === callback) this.subscriptions.delete(destination);
      },
    };
  }

  isSubscribed(destination: string): boolean {
    return this.subscriptions.has(destination);
  }

  /** The server accepted CONNECT. */
  open(): void {
    this.connected = true;
    this.config.onConnect?.({} as IFrame);
  }

  /** The server refused CONNECT (ERROR frame, then the socket closes). */
  refuse(message = 'UNAUTHENTICATED'): void {
    this.config.onStompError?.({ headers: { message } } as unknown as IFrame);
    this.drop();
  }

  /** The socket closed. */
  drop(): void {
    this.connected = false;
    this.config.onWebSocketClose?.(new CloseEvent('close'));
  }

  /** A private message from the server. */
  deliver(message: unknown): void {
    const handler = this.subscriptions.get(USER_PRIVATE_QUEUE);
    if (!handler) throw new Error('not subscribed to ' + USER_PRIVATE_QUEUE);
    handler({ body: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  /** A broadcast on `/topic/match/{matchId}`. */
  deliverTopic(matchId: string, message: unknown): void {
    const destination = matchTopic(matchId);
    const handler = this.subscriptions.get(destination);
    if (!handler) throw new Error('not subscribed to ' + destination);
    handler({ body: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  /** Bodies published to a destination, parsed. */
  bodiesTo(destination: string): unknown[] {
    return this.published.filter((p) => p.destination === destination).map((p) => JSON.parse(p.body ?? 'null'));
  }

  sentTo(destination: string): number {
    return this.published.filter((p) => p.destination === destination).length;
  }

  get authorization(): string | undefined {
    return (this.config.connectHeaders as Record<string, string> | undefined)?.Authorization;
  }
}

/** Routes the app's realtime module to FakeStomp clients; returns the list they are added to. */
export function useFakeRealtime(): FakeStomp[] {
  const clients: FakeStomp[] = [];
  configureRealtimeForTests({
    factory: (config) => {
      const client = new FakeStomp(config);
      clients.push(client);
      return client;
    },
    url: () => 'ws://localhost/ws',
  });
  return clients;
}

export const SERVER_TIME = '2026-11-12T10:15:30.123Z';
export const JOIN = '/app/matchmaking/QUICK/join';
export const CANCEL = '/app/matchmaking/QUICK/cancel';

export function matchFound(opponent: { name: string; kind: ParticipantKind }, matchId = crypto.randomUUID()) {
  const self = crypto.randomUUID();
  return {
    type: 'MATCH_FOUND',
    matchId,
    serverTime: SERVER_TIME,
    payload: {
      matchId,
      mode: 'QUICK',
      participants: [
        { participantId: self, displayName: 'Guest 4821', kind: 'GUEST' },
        { participantId: crypto.randomUUID(), displayName: opponent.name, kind: opponent.kind },
      ],
      questionCount: 10,
      questionSource: 'BANK',
      selfParticipantId: self,
    },
  };
}

export function serverError(code: string, matchId?: string) {
  return { type: 'ERROR', serverTime: SERVER_TIME, ...(matchId ? { matchId } : {}), payload: { code, ...(matchId ? { matchId } : {}) } };
}

export const MATCHMAKING_FAILED = {
  type: 'MATCHMAKING_FAILED',
  serverTime: SERVER_TIME,
  payload: { reason: 'QUESTION_SET_UNAVAILABLE' },
};

export const MATCHMAKING_CANCELLED = { type: 'MATCHMAKING_CANCELLED', serverTime: SERVER_TIME };

// ---------------------------------------------------------------------------------------------
// Live match frames (Story 1.8). Instants are relative to `base` (ms since epoch).

export const OPTIONS = ['പെരിയാർ', 'ഭാരതപ്പുഴ', 'പമ്പ', 'ചാലിയാർ'] as const;

export type QuestionOptions = {
  seq: number;
  questionIndex: number;
  /** startedAt, ms since epoch. */
  startedAt: number;
  windowMs?: number;
  textMl?: string | null;
  textEn?: string | null;
  options?: readonly string[];
  /** serverTime, ms since epoch (default startedAt). */
  serverTime?: number;
};

export function questionStarted(matchId: string, o: QuestionOptions) {
  const textMl = o.textMl === undefined ? 'കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏത്?' : o.textMl;
  const textEn = o.textEn === undefined ? 'Which is the longest river in Kerala?' : o.textEn;
  return {
    type: 'QUESTION_STARTED',
    matchId,
    seq: o.seq,
    serverTime: new Date(o.serverTime ?? o.startedAt).toISOString(),
    payload: {
      questionIndex: o.questionIndex,
      total: 10,
      startedAt: new Date(o.startedAt).toISOString(),
      deadline: new Date(o.startedAt + (o.windowMs ?? 15_000)).toISOString(),
      question: {
        questionId: `q-${o.questionIndex}`,
        version: 1,
        ...(textMl === null ? {} : { textMl }),
        ...(textEn === null ? {} : { textEn }),
        options: [...(o.options ?? OPTIONS)],
      },
    },
  };
}

export function scoreboard(matchId: string, seq: number, questionIndex: number, answered: string[], serverTime = SERVER_TIME) {
  return { type: 'SCOREBOARD', matchId, seq, serverTime, payload: { questionIndex, answered } };
}

export function answerAccepted(matchId: string, questionIndex: number, refSeq = 1, serverTime = SERVER_TIME) {
  return { type: 'ANSWER_ACCEPTED', matchId, refSeq, serverTime, payload: { questionIndex } };
}

/** A 1v1 ANSWER_ACCEPTED (Story 1.11): the receipt plus her own result. */
export function answerAcceptedWithResult(
  matchId: string,
  questionIndex: number,
  result: { correct: boolean; points: number; answerIndex: number; totalScore: number },
  refSeq = 1,
  serverTime = SERVER_TIME,
) {
  return { type: 'ANSWER_ACCEPTED', matchId, refSeq, serverTime, payload: { questionIndex, ...result } };
}

export type ResultOptions = { participantId: string; pickedIndex?: number | null; correct: boolean; points: number; totalScore: number };

export function questionRevealed(
  matchId: string,
  o: {
    seq: number;
    questionIndex: number;
    answerIndex: number;
    results: ResultOptions[];
    explanation?: string;
    attribution?: string | null;
    serverTime?: string;
  },
) {
  const attribution = o.attribution === undefined ? 'Kerala PSC LDC 2019' : o.attribution;
  return {
    type: 'QUESTION_REVEALED',
    matchId,
    seq: o.seq,
    serverTime: o.serverTime ?? SERVER_TIME,
    payload: {
      questionIndex: o.questionIndex,
      total: 10,
      questionId: `q-${o.questionIndex}`,
      version: 1,
      answerIndex: o.answerIndex,
      explanation: o.explanation ?? 'പെരിയാർ (244 കി.മീ) ആണ് കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി.',
      ...(attribution === null ? {} : { attribution }),
      results: o.results.map((r) => ({
        participantId: r.participantId,
        ...(r.pickedIndex === null || r.pickedIndex === undefined ? {} : { pickedIndex: r.pickedIndex }),
        correct: r.correct,
        points: r.points,
        totalScore: r.totalScore,
      })),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Reconnect, forfeit and leave (Story 1.9).

export type SnapshotOptions = {
  refSeq: number;
  phase?: 'LEAD_IN' | 'QUESTION_OPEN' | 'REVEAL' | 'ENDED';
  questionIndex?: number;
  /** startedAt (ms since epoch) of the open question; with `phase` QUESTION_OPEN. */
  startedAt?: number;
  windowMs?: number;
  lastReveal?: ReturnType<typeof questionRevealed>['payload'];
  answered?: string[];
  scores: { participantId: string; score: number; forfeited?: boolean }[];
  participants: { participantId: string; displayName: string; kind: string }[];
  youForfeited?: boolean;
  myAnswer?: { pickedIndex: number; correct?: boolean; points?: number; answerIndex?: number; totalScore?: number };
  serverTime?: string;
};

/** A private SNAPSHOT (the reply to `resync`). */
export function snapshot(matchId: string, o: SnapshotOptions) {
  const phase = o.phase ?? 'QUESTION_OPEN';
  const index = o.questionIndex ?? 0;
  const open = phase === 'QUESTION_OPEN';
  const startedAt = o.startedAt ?? Date.parse(SERVER_TIME);
  const started = questionStarted(matchId, { seq: 0, questionIndex: index, startedAt, windowMs: o.windowMs }).payload;
  return {
    type: 'SNAPSHOT',
    matchId,
    refSeq: o.refSeq,
    serverTime: o.serverTime ?? SERVER_TIME,
    payload: {
      phase,
      questionIndex: index,
      total: 10,
      ...(open ? { question: started.question, startedAt: started.startedAt, deadline: started.deadline } : {}),
      ...(o.lastReveal ? { lastReveal: o.lastReveal } : {}),
      answered: o.answered ?? [],
      scores: o.scores.map((s) => ({ participantId: s.participantId, score: s.score, forfeited: s.forfeited ?? false })),
      participants: o.participants,
      youForfeited: o.youForfeited ?? false,
      ...(o.myAnswer ? { myAnswer: o.myAnswer } : {}),
    },
  };
}

export function participantForfeited(matchId: string, seq: number, participantId: string, questionIndex = 0) {
  return { type: 'PARTICIPANT_FORFEITED', matchId, seq, serverTime: SERVER_TIME, payload: { participantId, questionIndex } };
}

export function matchAborted(matchId: string, seq: number, reason: 'ALL_LEFT' | 'ERROR' = 'ALL_LEFT') {
  return { type: 'MATCH_ABORTED', matchId, seq, serverTime: SERVER_TIME, payload: { reason } };
}

// ---------------------------------------------------------------------------------------------
// Results (Story 1.10).

export type EndedParticipant = {
  participantId: string;
  displayName: string;
  kind: string;
  score: number;
  correctCount: number;
  forfeited?: boolean;
  placement: number;
};

export type EndedAnswer = { pickedIndex?: number | null; correct: boolean; responseMs?: number | null; points: number };

/**
 * A private MATCH_ENDED. Questions default to `count` copies of the live question (answer index
 * 0, attribution on even questions only); `breakdown` maps each participant id to her answers.
 */
export function matchEnded(
  matchId: string,
  o: {
    participants: EndedParticipant[];
    breakdown: Record<string, EndedAnswer[]>;
    count?: number;
    questions?: { textMl?: string; textEn?: string; options?: string[]; answerIndex?: number; explanation?: string; attribution?: string | null }[];
    serverTime?: string;
  },
) {
  const count = o.count ?? Object.values(o.breakdown)[0]?.length ?? 10;
  const questions = Array.from({ length: count }, (_, i) => {
    const q = o.questions?.[i] ?? {};
    const attribution = q.attribution === undefined ? (i % 2 === 0 ? `Kerala PSC LDC 20${10 + i}` : null) : q.attribution;
    return {
      questionId: `q-${i}`,
      version: 1,
      textMl: q.textMl ?? `ചോദ്യം ${i + 1}: കേരളത്തിലെ ഏറ്റവും നീളം കൂടിയ നദി ഏത്?`,
      ...(q.textEn === undefined ? { textEn: `Question ${i + 1}: Which is the longest river in Kerala?` } : { textEn: q.textEn }),
      options: q.options ?? [...OPTIONS],
      answerIndex: q.answerIndex ?? 0,
      explanation: q.explanation ?? `വിശദീകരണം ${i + 1}`,
      ...(attribution === null ? {} : { attribution }),
    };
  });
  return {
    type: 'MATCH_ENDED',
    matchId,
    serverTime: o.serverTime ?? SERVER_TIME,
    payload: {
      matchId,
      mode: 'QUICK',
      questionSource: 'BANK',
      participants: o.participants.map((p) => ({ ...p, forfeited: p.forfeited ?? false })),
      questions,
      breakdown: o.participants.map((p) => ({
        participantId: p.participantId,
        answers: (o.breakdown[p.participantId] ?? []).map((a) => ({
          ...(a.pickedIndex === null || a.pickedIndex === undefined ? {} : { pickedIndex: a.pickedIndex }),
          correct: a.correct,
          ...(a.responseMs === null || a.responseMs === undefined ? {} : { responseMs: a.responseMs }),
          points: a.points,
        })),
      })),
    },
  };
}
