import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { maxPerWindow } from '../motion/flashBudget.ts';
import { requestFlash, resetFlashScheduler } from '../motion/flashScheduler.ts';
import { Button } from './Button.tsx';
import { PageColumn } from './PageColumn.tsx';
import { motion } from './tokens.ts';

// Dev-only QA page at /__flash (never shipped: App imports it behind import.meta.env.DEV).
// Fires bursts of full-viewport band flashes through the app-wide flash scheduler and reports
// the most flash starts seen in any 1000 ms window (must be 1). Band only, never volt.
// Strings here are developer-facing and not part of the i18n catalogue.
// check-i18n: dev-fixture

export default function FlashFixture() {
  useDocumentTitle('flash fixture');
  const [starts, setStarts] = useState<number[]>([]);
  const [flashing, setFlashing] = useState(false);
  const [queued, setQueued] = useState(0);
  const cancels = useRef<Array<() => void>>([]);
  const burstTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearBurstTimers = () => {
    for (const id of burstTimers.current.splice(0)) clearTimeout(id);
  };

  useEffect(
    () => () => {
      clearBurstTimers();
      resetFlashScheduler();
    },
    [],
  );

  const fire = useCallback((count: number, spacingMs: number) => {
    for (let i = 0; i < count; i += 1) {
      const id = setTimeout(() => {
        burstTimers.current = burstTimers.current.filter((t) => t !== id);
        setQueued((q) => q + 1);
        const cancel = requestFlash((startTime) => {
          setQueued((q) => q - 1);
          setStarts((list) => [...list, startTime]);
          setFlashing(true);
          setTimeout(() => setFlashing(false), motion.bandDrop);
        });
        cancels.current.push(cancel);
      }, i * spacingMs);
      burstTimers.current.push(id);
    }
  }, []);

  // Also drops burst requests not yet enqueued, so nothing fires after Cancel or Clear.
  const cancelAll = () => {
    clearBurstTimers();
    for (const cancel of cancels.current.splice(0)) cancel();
    setQueued(0);
  };

  const max = maxPerWindow(starts, motion.flashWindow);
  const deltas = starts.slice(1).map((t, i) => t - starts[i]!);

  return (
    <PageColumn className="gap-6 py-6">
      {flashing ? <div aria-hidden="true" data-flash="" className="fixed inset-[0] z-50 bg-band" /> : null}
      <main lang="en" data-dev-fixture="flash" className="flex flex-col gap-6">
        <h1 className="text-card-title font-card-title">Flash scheduler fixture</h1>
        <p className="text-muted">
          Each request paints a full-viewport band flash for {motion.bandDrop} ms. Bursts go through
          requestFlash, so starts must stay {motion.flashWindow} ms apart.
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <Button onClick={() => fire(3, 100)}>Burst 3 (100 ms apart)</Button>
          <Button onClick={() => fire(10, 0)}>Burst 10 (same tick)</Button>
          <Button variant="secondary" onClick={cancelAll}>
            Cancel queued
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              cancelAll();
              setStarts([]);
            }}
          >
            Clear log
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <dt>Max flashes in any {motion.flashWindow} ms</dt>
          <dd className="text-score font-score" data-testid="max-per-window">
            {max}
          </dd>
          <dt>Flashes started</dt>
          <dd>{starts.length}</dd>
          <dt>Queued</dt>
          <dd>{queued}</dd>
        </dl>
        <section className="flex flex-col gap-2">
          <h2 className="text-title font-title">rAF start timestamps</h2>
          <ol className="font-code text-code">
            {starts.map((t, i) => (
              <li key={i}>
                {t.toFixed(1)} ms{i > 0 ? ` (+${deltas[i - 1]!.toFixed(1)})` : ''}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </PageColumn>
  );
}
