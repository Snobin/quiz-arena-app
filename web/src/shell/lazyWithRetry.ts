import { createElement, lazy, type ComponentType } from 'react';

/** Lazy components whose last import failed; `resetFailedLazies` gives each a fresh `lazy` for the next render. */
const failed = new Set<() => void>();

/**
 * `lazy` that does not keep a failed import. React caches a rejected promise inside the lazy component, so
 * re-rendering it only rethrows. A failure is recorded here, and `resetFailedLazies()` (called by the error
 * boundary's Retry) swaps in a fresh `lazy`, so the next render imports again. Until then the failure stays
 * cached, which keeps React from retrying a dead chunk in a loop.
 */
export function lazyWithRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): T {
  const make = () =>
    lazy<T>(() =>
      load().catch((error: unknown) => {
        failed.add(refresh);
        throw error;
      }),
    );
  let Inner = make();
  const refresh = () => {
    Inner = make();
  };
  return function LazyWithRetry(props: object) {
    return createElement(Inner as unknown as ComponentType<object>, props);
  } as unknown as T;
}

export function resetFailedLazies(): void {
  failed.forEach((refresh) => refresh());
  failed.clear();
}
