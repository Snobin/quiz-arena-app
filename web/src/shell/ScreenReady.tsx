import { useEffect } from 'react';

/**
 * Focus hand-off for lazily loaded screens. After a navigation AppShell moves focus to the new screen's
 * `main h1`; when that screen's chunk is still loading only the Suspense fallback is there, so the move is
 * deferred (`deferScreenFocus`) and `ScreenReady`, rendered right after the screen inside its Suspense
 * boundary, completes it once the screen has mounted.
 */
let deferred = false;

/** The fallback heading carries this attribute so focus is never put on something about to be replaced. */
export const pendingAttr = 'data-screen-pending';

export const screenHeading = `main h1:not([${pendingAttr}])`;

export function deferScreenFocus(): void {
  deferred = true;
}

export function ScreenReady() {
  useEffect(() => {
    if (!deferred) return;
    deferred = false;
    document.querySelector<HTMLElement>(screenHeading)?.focus({ preventScroll: true });
  }, []);
  return null;
}
