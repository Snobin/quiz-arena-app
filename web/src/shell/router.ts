import { useEffect } from 'react';
import { create } from 'zustand';
import { rememberScroll } from './scrollMemory.ts';

/**
 * The in-house router: the app path (base stripped) in a Zustand store, updated by `navigate()`
 * and `popstate`. Static paths only; screens are chosen by a plain map in App.tsx.
 */

/** The base path without its trailing slash ('' at the root). */
function basePrefix(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * The app path for a location pathname: the base is stripped, the result starts with '/' and
 * has no trailing slash (except the root). A path outside the base is returned as is.
 */
export function stripBase(pathname: string, baseUrl: string = import.meta.env.BASE_URL): string {
  const base = basePrefix(baseUrl);
  let path = pathname;
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length);
  path = path.replace(/\/+$/, '');
  return path.startsWith('/') ? path : `/${path}`;
}

/** The location pathname (href) for an app path. */
export function withBase(path: string, baseUrl: string = import.meta.env.BASE_URL): string {
  const app = path.startsWith('/') ? path : `/${path}`;
  return `${basePrefix(baseUrl)}${app}`;
}

type RouterState = { pathname: string };

export const useRouter = create<RouterState>(() => ({
  pathname: typeof window === 'undefined' ? '/' : stripBase(window.location.pathname),
}));

/** The current app path (base stripped). */
export function usePathname(): string {
  return useRouter((state) => state.pathname);
}

function currentScrollY(): number {
  return typeof window === 'undefined' ? 0 : window.scrollY;
}

/** Splits '/rooms?x=1#top' into the path and the '?x=1#top' suffix. */
export function splitPath(path: string): { path: string; suffix: string } {
  const at = path.search(/[?#]/);
  return at === -1 ? { path, suffix: '' } : { path: path.slice(0, at), suffix: path.slice(at) };
}

/**
 * Moves to an app path, pushing a history entry (or replacing the current one). A query or hash
 * stays on the pushed URL; the store's pathname is the path alone.
 */
export function navigate(to: string, { replace = false }: { replace?: boolean } = {}): void {
  const from = useRouter.getState().pathname;
  rememberScroll(from, currentScrollY());
  const { path, suffix } = splitPath(to);
  const target = stripBase(withBase(path));
  const href = `${withBase(target)}${suffix}`;
  if (replace || target === from) window.history.replaceState(null, '', href);
  else window.history.pushState(null, '', href);
  useRouter.setState({ pathname: target });
}

/** Re-reads the location (after popstate, or a history change made outside the router). */
export function syncFromLocation(): void {
  const pathname = stripBase(window.location.pathname);
  if (pathname !== useRouter.getState().pathname) useRouter.setState({ pathname });
}

function onPopState(): void {
  // The DOM still shows the page being left, so its scroll offset is still accurate here.
  rememberScroll(useRouter.getState().pathname, currentScrollY());
  syncFromLocation();
}

/**
 * Listens to `popstate` while mounted, and syncs the store with the location on mount.
 * Call it once, from the app root.
 */
export function useRouterSync(): void {
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    syncFromLocation();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}
