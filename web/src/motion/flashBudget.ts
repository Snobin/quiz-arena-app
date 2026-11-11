/** The most timestamps falling inside any half-open window [t, t + windowMs). */
export function maxPerWindow(times: readonly number[], windowMs: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  let best = 0;
  let from = 0;
  for (let to = 0; to < sorted.length; to += 1) {
    while (sorted[to]! - sorted[from]! >= windowMs) from += 1;
    best = Math.max(best, to - from + 1);
  }
  return best;
}
