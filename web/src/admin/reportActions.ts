import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { session } from '../auth/session.ts';
import { apiUrl } from '../config/apiBase.ts';
import { announce } from '../shell/announce.ts';
import { adminT } from './adminI18n.ts';
import { AdminApiError, dismissReports, dismissRequest, type DismissRequest } from './api.ts';
import { UNDO_MS, reason } from './draftActions.ts';

/**
 * Delayed commit for Dismiss (Story 3.6), the same pattern as Publish and Discard in `draftActions.ts`: the dismissal
 * is held client-side for 5 s with an Undo and sent only when the window passes. The queue lives outside React so
 * leaving the page, navigating in the console or closing the tab sends it at once.
 */
export { UNDO_MS };

export type QueuedDismiss = { questionId: string; version: number; displayNo: number; note: string };
export type DismissBatch = { id: number; ref: QueuedDismiss; phase: 'pending' | 'committing' };

type State = { batches: DismissBatch[]; failures: Record<string, string> };

export const useReportActions = create<State>(() => ({ batches: [], failures: {} }));

export const groupKey = (ref: { questionId: string; version: number }): string => `${ref.questionId}:${ref.version}`;

const timers = new Map<number, ReturnType<typeof setTimeout>>();
const clients = new Map<number, QueryClient>();
let counter = 0;
let token: string | null = null;
let listening = false;

const label = (ref: QueuedDismiss) => ({ no: ref.displayNo.toLocaleString('en-US'), version: ref.version });
const bodyOf = (ref: QueuedDismiss): DismissRequest => ({ questionId: ref.questionId, version: ref.version, note: ref.note });

function captureToken(): void {
  void session
    .getAccessToken()
    .then((value) => {
      token = value;
    })
    .catch(() => undefined);
}

function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('pagehide', sendOnUnload);
}

/** Tab close: every dismissal still inside its window is sent now, with `keepalive` so the note body outlives the page. */
function sendOnUnload(): void {
  for (const batch of useReportActions.getState().batches) {
    if (batch.phase !== 'pending') continue;
    clearTimeout(timers.get(batch.id));
    timers.delete(batch.id);
    if (token === null) continue;
    const { path, body } = dismissRequest(bodyOf(batch.ref));
    void fetch(apiUrl(path), {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
    useReportActions.setState((s) => ({ batches: s.batches.filter((b) => b.id !== batch.id) }));
  }
}

/** Holds a dismissal for the Undo window. */
export function queueDismiss(queryClient: QueryClient, ref: QueuedDismiss): number {
  const id = ++counter;
  clients.set(id, queryClient);
  useReportActions.setState((s) => {
    const failures = { ...s.failures };
    delete failures[groupKey(ref)];
    return { batches: [...s.batches, { id, ref, phase: 'pending' }], failures };
  });
  timers.set(id, setTimeout(() => void commit(id), UNDO_MS));
  captureToken();
  listen();
  announce(adminT('reports.done', label(ref)));
  return id;
}

/** Takes a dismissal back inside its window: nothing was sent. Returns it, or null when it is no longer undoable. */
export function undoDismiss(id: number): DismissBatch | null {
  const batch = useReportActions.getState().batches.find((b) => b.id === id);
  if (!batch || batch.phase !== 'pending') return null;
  clearTimeout(timers.get(id));
  timers.delete(id);
  clients.delete(id);
  useReportActions.setState((s) => ({ batches: s.batches.filter((b) => b.id !== id) }));
  announce(adminT('reports.undone'));
  return batch;
}

/** Sends every dismissal still inside its window now (the admin navigated elsewhere in the console). */
export function commitPendingReports(): void {
  for (const batch of useReportActions.getState().batches) {
    if (batch.phase === 'pending') void commit(batch.id);
  }
}

async function commit(id: number): Promise<void> {
  const batch = useReportActions.getState().batches.find((b) => b.id === id);
  if (!batch || batch.phase !== 'pending') return;
  clearTimeout(timers.get(id));
  timers.delete(id);
  useReportActions.setState((s) => ({ batches: s.batches.map((b) => (b.id === id ? { ...b, phase: 'committing' } : b)) }));

  const failures: Record<string, string> = {};
  try {
    await dismissReports(bodyOf(batch.ref));
  } catch (error) {
    failures[groupKey(batch.ref)] = error instanceof AdminApiError ? reason(error.detail, error.errors) : adminT('error.unknown');
    announce(adminT('reports.failedAnnounce', label(batch.ref)));
  }
  const client = clients.get(id);
  clients.delete(id);
  try {
    await client?.invalidateQueries({ queryKey: ['admin', 'reports'] });
  } catch {
    // A failed refresh leaves the old list; the next visit refetches.
  }
  useReportActions.setState((s) => ({ batches: s.batches.filter((b) => b.id !== id), failures: { ...s.failures, ...failures } }));
}

/** Test helper. */
export function resetReportActions(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  clients.clear();
  token = null;
  useReportActions.setState({ batches: [], failures: {} });
}
