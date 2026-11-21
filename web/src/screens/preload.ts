// Warm the next lazy chunk ahead of need. Same specifiers as the lazy() calls in App.tsx, so the chunk is reused.
// A failed preload is ignored: the real navigation retries the import.
export const preloadLiveMatch = (): void => {
  void import('./match/LiveMatchScreen.tsx').catch(() => {});
};
export const preloadResults = (): void => {
  void import('./results/ResultsScreen.tsx').catch(() => {});
};
