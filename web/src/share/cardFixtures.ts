import type { MatchEndedPayload, ResultParticipant } from '../realtime/protocol.ts';

const person = (id: string, name: string, score: number, placement: number, kind: 'USER' | 'GUEST' | 'BOT' = 'USER'): ResultParticipant => ({
  participantId: id,
  displayName: name,
  kind,
  score,
  correctCount: 5,
  placement,
  forfeited: false,
});

const base = { questions: [], breakdown: [] };

export const SELF = 'p-self';

export type Case = { name: string; payload: MatchEndedPayload };

/** The seven shapes the epic names, as stored `MATCH_ENDED` payloads. */
export const CASES: Case[] = [
  {
    name: 'quick win',
    payload: { matchId: 'm', mode: 'QUICK', questionSource: 'BANK', participants: [person(SELF, 'Anju', 7840, 1), person('p2', 'Vishnu', 7420, 2)], ...base },
  },
  {
    name: 'quick loss',
    payload: { matchId: 'm', mode: 'QUICK', questionSource: 'BANK', participants: [person(SELF, 'Anju', 7420, 2), person('p2', 'Vishnu', 7840, 1)], ...base },
  },
  {
    name: 'quick draw',
    payload: { matchId: 'm', mode: 'QUICK', questionSource: 'BANK', participants: [person(SELF, 'Anju', 7420, 1), person('p2', 'Vishnu', 7420, 1)], ...base },
  },
  {
    name: 'duel win against a bot',
    payload: {
      matchId: 'm',
      mode: 'TOPIC_DUEL',
      questionSource: 'BANK',
      topic: { topicId: 't', name: 'Kerala History', subjectName: 'History' },
      participants: [person(SELF, 'Anju', 7840, 1), person('b', 'Bot 7', 3100, 2, 'BOT')],
      ...base,
    },
  },
  ...[
    { name: 'room sole #1', placement: 1, joint: false },
    { name: 'room joint win', placement: 1, joint: true },
    { name: 'room #7 of 23', placement: 7, joint: false },
  ].map(({ name, placement, joint }): Case => ({
    name,
    payload: {
      matchId: 'm',
      mode: 'BATTLE_ROOM',
      questionSource: 'BANK',
      topic: { topicId: 't', name: 'Kerala History', subjectName: 'History' },
      participants: [
        person(SELF, 'Anju', 5200, placement),
        ...Array.from({ length: 22 }, (_, i) => person(`o${i}`, `Player ${i}`, 4000 - i * 100, joint && i === 0 ? 1 : i + (placement === 1 ? 2 : 1))),
      ],
      ...base,
    },
  })),
  {
    name: 'custom room',
    payload: {
      matchId: 'm',
      mode: 'BATTLE_ROOM',
      questionSource: 'CUSTOM',
      topic: { name: 'Rajeev Sir Renaissance Batch' },
      participants: [person(SELF, 'Anju', 5200, 3), ...Array.from({ length: 9 }, (_, i) => person(`o${i}`, `Player ${i}`, 4000 - i * 100, i < 2 ? i + 1 : i + 2))],
      ...base,
    },
  },
];
