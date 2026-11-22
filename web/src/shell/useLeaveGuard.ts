import { useCallback, useEffect, useRef, useState } from 'react';
import { setNavigationGuard } from './router.ts';

/**
 * Guards leaving a page with unsaved changes: `beforeunload` for a tab close or reload, and the router's leave guard
 * for in-app navigation (links, the nav, Back). While `dirty`, a leave sets `asking`; the page shows its confirm and
 * calls `leave()` or `stay()`.
 */
export function useLeaveGuard(dirty: boolean): { asking: boolean; leave: () => void; stay: () => void; release: () => void } {
  const dirtyRef = useRef(dirty);
  const pending = useRef<(() => void) | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(
    () =>
      setNavigationGuard((proceed) => {
        if (!dirtyRef.current) return false;
        pending.current = proceed;
        setAsking(true);
        return true;
      }),
    [],
  );

  const leave = useCallback(() => {
    const proceed = pending.current;
    pending.current = null;
    setAsking(false);
    // The guard is dropped first so the move itself is not asked about again.
    dirtyRef.current = false;
    proceed?.();
  }, []);

  const stay = useCallback(() => {
    pending.current = null;
    setAsking(false);
  }, []);

  /** For a move the page makes itself right after saving: the state update that clears `dirty` has not landed yet. */
  const release = useCallback(() => {
    dirtyRef.current = false;
  }, []);

  return { asking, leave, stay, release };
}
