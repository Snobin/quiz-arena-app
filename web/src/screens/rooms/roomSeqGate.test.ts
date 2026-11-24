import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeqGate } from './roomSeqGate.ts';

type Frame = { message: { seq?: number }; id: string };
const frame = (seq: number | undefined, id = `f${seq}`): Frame => ({ message: { seq }, id });

function setup(options: { canResync?: boolean } = {}) {
  let last = 0;
  const applied: string[] = [];
  const resyncs = { count: 0 };
  const gate = createSeqGate<Frame>({
    retryMs: 1000,
    lastSeq: () => last,
    apply: (f) => {
      applied.push(f.id);
      last = f.message.seq ?? last;
    },
    requestResync: () => {
      resyncs.count++;
      return options.canResync ?? true;
    },
  });
  return { gate, applied, resyncs, setLast: (n: number) => (last = n), last: () => last };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('room sequence gate', () => {
  it('applies the next frame, drops a stale one and applies an unnumbered one at once', () => {
    const { gate, applied, resyncs, last } = setup();
    gate.receive(frame(1), last());
    gate.receive(frame(1, 'dup'), last());
    gate.receive(frame(undefined, 'unnumbered'), last());
    expect(applied).toEqual(['f1', 'unnumbered']);
    expect(resyncs.count).toBe(0);
  });

  it('holds frames after a gap, asks for one resync and does not apply anything until the fresh state', () => {
    const { gate, applied, resyncs, last } = setup();
    gate.receive(frame(1), last());
    gate.receive(frame(3), last());
    gate.receive(frame(4), last());
    gate.receive(frame(2), last()); // even the in-order one waits while a resync is out
    expect(applied).toEqual(['f1']);
    expect(resyncs.count).toBe(1);
  });

  it('asks again every retry period while unanswered, and stops once drained', () => {
    const { gate, applied, resyncs, setLast, last } = setup();
    gate.receive(frame(2), last());
    expect(resyncs.count).toBe(1);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(resyncs.count).toBe(3);
    setLast(1); // the fresh ROOM_JOINED arrives with refSeq 1
    gate.drain();
    expect(applied).toEqual(['f2']);
    vi.advanceTimersByTime(5000);
    expect(resyncs.count).toBe(3);
  });

  it('drains the held frames above the fresh state in order and resyncs again at the next gap', () => {
    const { gate, applied, resyncs, setLast, last } = setup();
    gate.receive(frame(5), last());
    gate.receive(frame(3), last());
    gate.receive(frame(8), last());
    gate.receive(frame(4), last());
    setLast(2); // the fresh ROOM_JOINED carries refSeq 2
    gate.drain();
    expect(applied).toEqual(['f3', 'f4', 'f5']); // 8 is a gap away from 5: held, resync asked again
    expect(resyncs.count).toBe(2);
    setLast(7);
    gate.drain();
    expect(applied).toEqual(['f3', 'f4', 'f5', 'f8']);
  });

  it('skips held frames at or below the fresh state', () => {
    const { gate, applied, setLast, last } = setup();
    gate.receive(frame(3), last());
    gate.receive(frame(4), last());
    setLast(4);
    gate.drain();
    expect(applied).toEqual([]);
  });

  it('arms no retry when the resync cannot be asked for, but keeps holding', () => {
    const { gate, applied, resyncs, last } = setup({ canResync: false });
    gate.receive(frame(3), last());
    vi.advanceTimersByTime(5000);
    expect(resyncs.count).toBe(1);
    gate.receive(frame(1), last());
    expect(applied).toEqual([]); // still awaiting a resync
  });

  it('forgets held frames for another room, and reset clears the resync state too', () => {
    const { gate, applied, resyncs, setLast, last } = setup();
    gate.receive(frame(3), last());
    gate.dropHeld();
    setLast(2);
    gate.drain();
    expect(applied).toEqual([]);
    gate.receive(frame(9), last());
    gate.reset();
    vi.advanceTimersByTime(5000);
    expect(resyncs.count).toBe(2);
    gate.receive(frame(3), last()); // no longer awaiting: in order, so applied
    expect(applied).toEqual(['f3']);
  });

  it('stopRetrying keeps what is held but stops asking', () => {
    const { gate, resyncs, last } = setup();
    gate.receive(frame(4), last());
    gate.stopRetrying();
    vi.advanceTimersByTime(5000);
    expect(resyncs.count).toBe(1);
  });
});
