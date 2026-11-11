/** Last known scroll offset per app path, so each tab comes back where it was left. */
const offsets = new Map<string, number>();

export function rememberScroll(pathname: string, y: number): void {
  offsets.set(pathname, Math.max(0, y));
}

/** The remembered offset, or 0 for a path not visited yet. */
export function recallScroll(pathname: string): number {
  return offsets.get(pathname) ?? 0;
}

/** Test helper. */
export function clearScrollMemory(): void {
  offsets.clear();
}
