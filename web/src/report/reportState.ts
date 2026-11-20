/**
 * Report state kept above the components (Story 3.5), so collapsing a breakdown row, which unmounts its
 * details, loses neither a typed note nor the fact that a report was sent. Lives for the page session.
 * `open` is undefined until she opens or cancels the note field (then a marked row's default applies).
 */
type ReportState = { settled: boolean; open: boolean | undefined; note: string };

const states = new Map<string, ReportState>();

export function reportKey(matchId: string | undefined, questionId: string, version: number): string {
  return `${matchId ?? ''}|${questionId}|${version}`;
}

export function getReportState(key: string): ReportState {
  return states.get(key) ?? { settled: false, open: undefined, note: '' };
}

export function patchReportState(key: string, patch: Partial<ReportState>): void {
  states.set(key, { ...getReportState(key), ...patch });
}

/** Test helper. */
export function resetReportState(): void {
  states.clear();
}
