import { create } from 'zustand';

type Message = { text: string; seq: number };

type AnnounceState = { polite: Message; assertive: Message };

const EMPTY: Message = { text: '', seq: 0 };

export const useAnnouncements = create<AnnounceState>(() => ({ polite: EMPTY, assertive: EMPTY }));

type Channel = keyof AnnounceState;

/** Messages announced on a channel in the current tick, flushed together in a microtask. */
const pending: Record<Channel, string[]> = { polite: [], assertive: [] };

function flush(channel: Channel): void {
  const text = pending[channel].join(' ');
  pending[channel] = [];
  if (text) useAnnouncements.setState((state) => ({ [channel]: { text, seq: state[channel].seq + 1 } }));
}

/**
 * Speaks `text` through the shared live regions (polite by default). The assertive region is
 * for reconnect start only. Repeating identical text is announced again. Messages announced on
 * one channel in the same tick are joined with a space into one update, so none is lost.
 */
export function announce(text: string, { assertive = false }: { assertive?: boolean } = {}): void {
  const channel: Channel = assertive ? 'assertive' : 'polite';
  if (pending[channel].push(text) === 1) queueMicrotask(() => flush(channel));
}

/**
 * The region content for a message. Every other repeat carries a trailing no-break space, so
 * identical text still changes the DOM and screen readers announce it again.
 */
export function regionText({ text, seq }: Message): string {
  return seq % 2 === 0 ? `${text} ` : text;
}

/** Test helper. */
export function resetAnnouncements(): void {
  pending.polite = [];
  pending.assertive = [];
  useAnnouncements.setState({ polite: EMPTY, assertive: EMPTY });
}
