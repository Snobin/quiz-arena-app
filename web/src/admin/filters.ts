import { useCallback, useSyncExternalStore } from 'react';
import { useRouter, withBase } from '../shell/router.ts';

/** The Questions filters as they live in the URL query. `page` is 0-based, as in the API. */
export type Filters = {
  status: string;
  category: string;
  subjectId: string;
  topicId: string;
  examLevel: string;
  difficulty: string;
  q: string;
  page: number;
};

export const EMPTY_FILTERS: Filters = { status: '', category: '', subjectId: '', topicId: '', examLevel: '', difficulty: '', q: '', page: 0 };

export const PAGE_SIZE = 50;
const EVENT = 'minnal:admin-search';

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const page = Number.parseInt(params.get('page') ?? '0', 10);
  return {
    status: params.get('status') ?? '',
    category: params.get('category') ?? '',
    subjectId: params.get('subjectId') ?? '',
    topicId: params.get('topicId') ?? '',
    examLevel: params.get('examLevel') ?? '',
    difficulty: params.get('difficulty') ?? '',
    q: params.get('q') ?? '',
    page: Number.isFinite(page) && page > 0 ? page : 0,
  };
}

/** The query string (no '?') for the filters: empty values and page 0 are left out. */
export function filtersToSearch(filters: Filters): string {
  const params = new URLSearchParams();
  for (const key of ['status', 'category', 'subjectId', 'topicId', 'examLevel', 'difficulty', 'q'] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (filters.page > 0) params.set('page', String(filters.page));
  return params.toString();
}

/** What is sent to the API: the URL filters plus the page size. */
export function apiSearch(filters: Filters): string {
  const params = new URLSearchParams(filtersToSearch(filters));
  params.set('size', String(PAGE_SIZE));
  return params.toString();
}

export function isFiltered(filters: Filters): boolean {
  return filtersToSearch({ ...filters, page: 0 }) !== '';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('popstate', callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('popstate', callback);
    window.removeEventListener(EVENT, callback);
  };
}

const snapshot = () => window.location.search;

/**
 * The filters in the URL, and a setter. A change pushes a history entry (so Back restores the previous filters);
 * `replace` rewrites the current one (used while typing in the search box). Any change but a page change goes back to page 1.
 */
export function useFilters(): [Filters, (patch: Partial<Filters>, options?: { replace?: boolean }) => void] {
  const search = useSyncExternalStore(subscribe, snapshot, () => '');
  const setFilters = useCallback((patch: Partial<Filters>, { replace = false }: { replace?: boolean } = {}) => {
    const current = parseFilters(window.location.search);
    const next: Filters = { ...current, ...patch, page: patch.page ?? 0 };
    const query = filtersToSearch(next);
    const href = `${withBase(useRouter.getState().pathname)}${query ? `?${query}` : ''}`;
    if (href === `${window.location.pathname}${window.location.search}`) return;
    if (replace) window.history.replaceState(window.history.state, '', href);
    else window.history.pushState({ minnal: true }, '', href);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [parseFilters(search), setFilters];
}
