import type { MatchEndedPayload, ResultParticipant } from '../../realtime/protocol.ts';

/**
 * Reads her result off a MATCH_ENDED, using only the server's placements (no ranking or scoring
 * here): a win is placement 1 not shared, a draw is a shared placement 1, anything else a loss.
 */
export type ResultKind = 'win' | 'loss' | 'draw';

export type ResultView = {
  kind: ResultKind;
  self: ResultParticipant;
  /** The opponents, in the server's order. */
  opponents: ResultParticipant[];
  /** The opponent shown beside her score: the best placed one (first in order on a tie). */
  rival: ResultParticipant | null;
  /** Whoever placed first when she did not (the loss line names them). */
  winner: ResultParticipant | null;
};

export function resultView(payload: MatchEndedPayload, selfId: string): ResultView | null {
  const self = payload.participants.find((p) => p.participantId === selfId);
  if (!self) return null;
  const opponents = payload.participants.filter((p) => p.participantId !== selfId);
  const sharedFirst = self.placement === 1 && opponents.some((p) => p.placement === 1);
  const kind: ResultKind = self.placement !== 1 ? 'loss' : sharedFirst ? 'draw' : 'win';
  const rival = opponents.reduce<ResultParticipant | null>((best, p) => (best === null || p.placement < best.placement ? p : best), null);
  const winner = kind === 'loss' ? (payload.participants.find((p) => p.placement === 1) ?? null) : null;
  return { kind, self, opponents, rival, winner };
}
