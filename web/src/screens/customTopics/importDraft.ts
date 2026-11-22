/** The unsent paste, kept in sessionStorage so an accidental reload brings it back. Every access is guarded: storage can be blocked. */
const KEY = 'minnal.customImportDraft';

export type Draft = { name: string; text: string; nameEdited: boolean };

const EMPTY: Draft = { name: '', text: '', nameEdited: false };

export function readDraft(): Draft {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const value = JSON.parse(raw) as Partial<Draft>;
    return {
      name: typeof value.name === 'string' ? value.name : '',
      text: typeof value.text === 'string' ? value.text : '',
      nameEdited: value.nameEdited === true,
    };
  } catch {
    return EMPTY;
  }
}

export function writeDraft(draft: Draft): void {
  try {
    if (draft.text === '' && draft.name === '') window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // blocked or full: the screen works without a draft
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
