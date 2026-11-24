/**
 * Applies the room's numbered broadcasts in order (the Story 1.9 rules): a frame at or below the last seen is dropped; a
 * gap (`seq > lastSeq + 1`) sends one lobby resync (again every `retryMs` while unanswered) and holds the frames until the
 * fresh `ROOM_JOINED`, after which the held frames above its `refSeq` apply in order, resyncing again at the next gap.
 * It knows nothing of sockets or the store: `roomClient.ts` gives it the last applied seq, how to apply a frame, and how to
 * ask for the resync.
 */
export type SeqFrame = { message: { seq?: number } };

export type SeqGate<T extends SeqFrame> = {
  /** A frame of the current room, `lastSeq` being the last one applied. Applied now, held, or dropped. */
  receive(frame: T, lastSeq: number): void;
  /** After a fresh `ROOM_JOINED`: the held frames above it, in order, until the next gap. */
  drain(): void;
  /** The held frames belong to another room: forget them (the resync state stays). */
  dropHeld(): void;
  /** The socket went: stop asking again; what is held stays until the room is re-synced. */
  stopRetrying(): void;
  /** Back to nothing held and nothing awaited. */
  reset(): void;
};

export function createSeqGate<T extends SeqFrame>(options: {
  retryMs: number;
  lastSeq: () => number;
  apply: (frame: T) => void;
  /** Asks for the resync; false when it cannot be asked for now (no room, no open socket), so no retry is armed. */
  requestResync: () => boolean;
}): SeqGate<T> {
  let held: T[] = [];
  let awaiting = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  function resync(): void {
    stopTimer();
    awaiting = true;
    if (!options.requestResync()) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (awaiting) resync();
    }, options.retryMs);
  }

  return {
    receive(frame, lastSeq) {
      const seq = frame.message.seq;
      if (seq === undefined) {
        options.apply(frame);
        return;
      }
      if (seq <= lastSeq) return;
      if (awaiting || seq > lastSeq + 1) {
        held.push(frame);
        if (!awaiting) resync();
        return;
      }
      options.apply(frame);
    },
    drain() {
      awaiting = false;
      stopTimer();
      const frames = held.sort((a, b) => (a.message.seq ?? 0) - (b.message.seq ?? 0));
      held = [];
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]!;
        const last = options.lastSeq();
        const seq = frame.message.seq ?? last + 1;
        if (seq <= last) continue;
        if (seq > last + 1) {
          held = frames.slice(i);
          resync();
          return;
        }
        options.apply(frame);
      }
    },
    dropHeld() {
      held = [];
    },
    stopRetrying: stopTimer,
    reset() {
      stopTimer();
      held = [];
      awaiting = false;
    },
  };
}
