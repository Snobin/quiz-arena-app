import { useSyncExternalStore } from 'react';

/**
 * Install prompt plumbing (Story 7.2). The browser fires `beforeinstallprompt` once, early, so this module is imported at boot:
 * it keeps the event (and stops the browser's own mini-infobar) until the install card asks for it. Installation is per device,
 * so the per-user state lives in localStorage as `install:{userId}`.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export type InstallState = 'PENDING' | 'DISMISSED' | 'INSTALLED';

let snapshot: { event: InstallEvent | null; installed: boolean } = { event: null, installed: false };
const listeners = new Set<() => void>();
const set = (next: typeof snapshot) => {
  snapshot = next;
  listeners.forEach((l) => l());
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    set({ ...snapshot, event: e as InstallEvent });
  });
  window.addEventListener('appinstalled', () => set({ event: null, installed: true }));
}

export const useInstallSnapshot = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => snapshot,
  );

/** Test hook: forget the kept event and the installed flag. */
export const resetInstall = () => set({ event: null, installed: false });

export const isStandalone = (): boolean =>
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
  (navigator as { standalone?: boolean }).standalone === true;

/** iOS Safari proper: no install event there; Chrome, Firefox, Edge, Opera and in-app browsers on iOS are not it. */
export const isIosSafari = (ua = navigator.userAgent): boolean =>
  /iPhone|iPad|iPod/.test(ua) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line\//.test(ua);

/** The card to show, or none: the kept event wins, else iOS Safari's instructions. */
export const offerKind = (event: InstallEvent | null): 'prompt' | 'ios' | null =>
  isStandalone() ? null : event ? 'prompt' : isIosSafari() ? 'ios' : null;

const key = (userId: string) => `install:${userId}`;

/** A failing read counts as dismissed, so a broken store never makes the card nag. */
export function installState(userId: string): InstallState {
  try {
    const raw = localStorage.getItem(key(userId));
    if (raw === null) return 'PENDING';
    const state = (JSON.parse(raw) as { state?: string }).state;
    return state === 'INSTALLED' || state === 'DISMISSED' || state === 'PENDING' ? state : 'DISMISSED';
  } catch {
    return 'DISMISSED';
  }
}

export function saveInstallState(userId: string, state: InstallState): void {
  try {
    const prior = localStorage.getItem(key(userId));
    const firstMatchSeen = (prior && (JSON.parse(prior) as { firstMatchSeen?: number }).firstMatchSeen) || Date.now();
    localStorage.setItem(key(userId), JSON.stringify({ firstMatchSeen, state }));
  } catch {
    /* the card still goes for this visit */
  }
}

/** Shows the browser's install dialog with the kept event (usable once). A throw counts as dismissed. */
export async function promptInstall(event: InstallEvent): Promise<'accepted' | 'dismissed'> {
  set({ ...snapshot, event: null });
  try {
    await event.prompt();
    return (await event.userChoice).outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'dismissed';
  }
}
