import { create } from 'zustand';

/** A one-line notice shown once on guest Home after she deleted her account (Story 2.8). */
export const useAccountNotice = create<{ deleted: boolean }>(() => ({ deleted: false }));

export function showAccountDeleted(): void {
  useAccountNotice.setState({ deleted: true });
}

export function clearAccountNotice(): void {
  useAccountNotice.setState({ deleted: false });
}
