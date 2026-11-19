import { create } from 'zustand';
import type { Mode } from '../ratings/ratingsApi.ts';
import type { Period } from './leaderboardApi.ts';

/** The Ranks tab keeps its last mode and period when she leaves and comes back (UX-DR15); scroll is kept by the shell. */
type Selection = { mode: Mode; period: Period };

export const useRanksSelection = create<Selection>(() => ({ mode: 'QUICK', period: 'daily' }));

export function selectBoard(mode: Mode, period: Period): void {
  useRanksSelection.setState({ mode, period });
}

/** Test helper. */
export function resetRanksSelection(): void {
  useRanksSelection.setState({ mode: 'QUICK', period: 'daily' });
}
