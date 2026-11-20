import type { KeyboardEvent } from 'react';
import { create } from 'zustand';

/** The per-browser switch for the single-key shortcuts (Story 3.4). Default on; storage can be blocked. */
export const SHORTCUTS_KEY = 'minnal.admin.shortcuts';

function stored(): boolean {
  try {
    return typeof window === 'undefined' ? true : window.localStorage.getItem(SHORTCUTS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const useShortcuts = create<{ enabled: boolean }>(() => ({ enabled: stored() }));

export function setShortcutsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SHORTCUTS_KEY, enabled ? 'on' : 'off');
  } catch {
    // Blocked storage: the switch still works until the page is closed.
  }
  useShortcuts.setState({ enabled });
}

/** Test helper: re-reads the stored switch. */
export function resyncShortcuts(): void {
  useShortcuts.setState({ enabled: stored() });
}

function inField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  return target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

/**
 * The shortcut key (lower case) a key press means, or null: the switch is off, a Ctrl, Alt or Meta key is held, the
 * target is an input, textarea, select or contenteditable, or the key is not a single character. Non-Latin layouts fall back to the physical key (`event.code`).
 */
export function shortcutFrom(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'target'>): string | null {
  if (!useShortcuts.getState().enabled) return null;
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (inField(event.target)) return null;
  // A Latin letter by what it types; on another layout (Malayalam, say) by the physical key, so P, D, E, J, K still work.
  if (/^[A-Za-z]$/.test(event.key)) return event.key.toLowerCase();
  const physical = /^Key([A-Z])$/.exec(event.code ?? '');
  if (physical) return (physical[1] as string).toLowerCase();
  return event.key.length === 1 ? event.key.toLowerCase() : null;
}
