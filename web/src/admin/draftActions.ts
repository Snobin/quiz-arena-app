import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { session } from '../auth/session.ts';
import { apiUrl } from '../config/apiBase.ts';
import { announce } from '../shell/announce.ts';
import { adminT } from './adminI18n.ts';
import { AdminApiError, commitBulk, commitRequest, commitSingle, type DraftAction, type DraftRef, type FieldProblem } from './api.ts';

/**
 * Delayed commit for Publish and Discard (Story 3.4): an action is held client-side for 5 s with an Undo, and the
 * request is sent only when the window passes, so a published version never needs reverting. The queue lives outside
 * React so it survives page changes: leaving a page, navigating in the console, or closing the tab commits at once.
 */
export const UNDO_MS = 5000;

export type QueuedRef = DraftRef & { displayNo: number };
export type Batch = { id: number; action: DraftAction; refs: QueuedRef[]; bulk: boolean; phase: 'pending' | 'committing' };

type State = { batches: Batch[]; failures: Record<string, string> };

export const useDraftActions = create<State>(() => ({ batches: [], failures: {} }));

export const refKey = (ref: DraftRef): string => `${ref.questionId}:${ref.version}`;

const timers = new Map<number, ReturnType<typeof setTimeout>>();
const clients = new Map<number, QueryClient>();
let counter = 0;
let token: string | null = null;
let listening = false;

const noQuestion = (ref: QueuedRef) => ({ no: ref.displayNo.toLocaleString('en-US'), version: ref.version });

function doneText(action: DraftAction, refs: QueuedRef[], bulk: boolean): string {
  if (bulk) return adminT(action === 'publish' ? 'drafts.doneMany.publish' : 'drafts.doneMany.discard', { count: refs.length });
  return adminT(action === 'publish' ? 'drafts.done.publish' : 'drafts.done.discard', noQuestion(refs[0] as QueuedRef));
}

/** The reason an action failed: the Problem Details `detail`, with its field problems when it has them. */
export function reason(detail: string | null | undefined, errors: FieldProblem[] = []): string {
  const fields = errors.map((e) => `${e.field}: ${e.problem}`).join('; ');
  return [detail, fields].filter(Boolean).join(' ') || adminT('error.unknown');
}

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

/** Tab close: every action still inside its Undo window is sent now, with `keepalive` so it outlives the page. */
function sendOnUnload(): void {
  for (const batch of useDraftActions.getState().batches) {
    if (batch.phase !== 'pending') continue;
    clearTimeout(timers.get(batch.id));
    timers.delete(batch.id);
    if (token === null) continue;
    const { path, body } = commitRequest(batch.action, batch.refs, batch.bulk);
    void fetch(apiUrl(path), {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => undefined);
    useDraftActions.setState((s) => ({ batches: s.batches.filter((b) => b.id !== batch.id) }));
  }
}

/** Holds an action for the Undo window. `bulk` batches go through the bulk endpoint when committed. */
export function queueAction(queryClient: QueryClient, action: DraftAction, refs: QueuedRef[], bulk: boolean): number {
  const id = ++counter;
  clients.set(id, queryClient);
  useDraftActions.setState((s) => {
    const failures = { ...s.failures };
    for (const ref of refs) delete failures[refKey(ref)];
    return { batches: [...s.batches, { id, action, refs, bulk, phase: 'pending' }], failures };
  });
  timers.set(id, setTimeout(() => void commit(id), UNDO_MS));
  captureToken();
  listen();
  announce(doneText(action, refs, bulk));
  return id;
}

/** Takes a batch back inside its window: nothing was sent. Returns it, or null when it is no longer undoable. */
export function undoBatch(id: number): Batch | null {
  const batch = useDraftActions.getState().batches.find((b) => b.id === id);
  if (!batch || batch.phase !== 'pending') return null;
  clearTimeout(timers.get(id));
  timers.delete(id);
  clients.delete(id);
  useDraftActions.setState((s) => ({ batches: s.batches.filter((b) => b.id !== id) }));
  announce(adminT(batch.action === 'publish' ? 'drafts.undone.publish' : 'drafts.undone.discard'));
  return batch;
}

/** Sends every action still inside its window now (the admin navigated elsewhere in the console). */
export function commitPending(): void {
  for (const batch of useDraftActions.getState().batches) {
    if (batch.phase === 'pending') void commit(batch.id);
  }
}

async function commit(id: number): Promise<void> {
  const batch = useDraftActions.getState().batches.find((b) => b.id === id);
  if (!batch || batch.phase !== 'pending') return;
  clearTimeout(timers.get(id));
  timers.delete(id);
  useDraftActions.setState((s) => ({ batches: s.batches.map((b) => (b.id === id ? { ...b, phase: 'committing' } : b)) }));

  const failures: Record<string, string> = {};
  try {
    if (batch.bulk) {
      const results = await commitBulk(batch.action, batch.refs);
      batch.refs.forEach((ref, index) => {
        const result = results[index];
        if (!result?.ok) failures[refKey(ref)] = reason(result?.detail, result?.errors);
      });
    } else {
      await commitSingle(batch.action, batch.refs[0] as QueuedRef);
    }
  } catch (error) {
    const text = error instanceof AdminApiError ? reason(error.detail, error.errors) : adminT('error.unknown');
    for (const ref of batch.refs) failures[refKey(ref)] = text;
  }

  const failed = Object.keys(failures).length;
  if (failed > 0) {
    const first = batch.refs.find((ref) => failures[refKey(ref)]) as QueuedRef;
    announce(adminT(batch.action === 'publish' ? 'drafts.failedAnnounce.publish' : 'drafts.failedAnnounce.discard', { ...noQuestion(first), count: failed }));
  }
  const client = clients.get(id);
  clients.delete(id);
  // The rows stay collapsed until the list has been refreshed, so a committed row never flashes back.
  try {
    await Promise.all([
      client?.invalidateQueries({ queryKey: ['admin', 'drafts'] }),
      client?.invalidateQueries({ queryKey: ['admin', 'questions'] }),
      client?.invalidateQueries({ queryKey: ['admin', 'reports'] }),
    ]);
  } catch {
    // A failed refresh leaves the old list; the next visit refetches.
  }
  useDraftActions.setState((s) => ({ batches: s.batches.filter((b) => b.id !== id), failures: { ...s.failures, ...failures } }));
}

/** The draft the admin was editing when they left the queue: the queue focuses its row on return. */
let returnFocus: string | null = null;
export const setReturnFocus = (key: string | null): void => {
  returnFocus = key;
};
export const hasReturnFocus = (): boolean => returnFocus !== null;
export function takeReturnFocus(): string | null {
  const key = returnFocus;
  returnFocus = null;
  return key;
}

/** Test helper. */
export function resetDraftActions(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  clients.clear();
  token = null;
  returnFocus = null;
  useDraftActions.setState({ batches: [], failures: {} });
}
