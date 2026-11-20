import { useCallback, useSyncExternalStore } from 'react';
import { useRouter, withBase } from '../shell/router.ts';

/** The Reports page tab as it lives in the URL (`?tab=closed`); Open is the default and leaves the URL bare. */
export type ReportTab = 'open' | 'closed';

const EVENT = 'minnal:admin-search';

export function parseTab(search: string): ReportTab {
  return new URLSearchParams(search).get('tab') === 'closed' ? 'closed' : 'open';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('popstate', callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(EVENT, callback);
  };
}

/** The tab in the URL and a setter; a change pushes a history entry so Back restores the previous tab. */
export function useReportTab(): [ReportTab, (tab: ReportTab) => void] {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => '');
  const setTab = useCallback((tab: ReportTab) => {
    const href = `${withBase(useRouter.getState().pathname)}${tab === 'closed' ? '?tab=closed' : ''}`;
    if (href === `${window.location.pathname}${window.location.search}`) return;
    window.history.pushState({ minnal: true }, '', href);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [parseTab(search), setTab];
}
