import { useEffect } from 'react';
import { create } from 'zustand';

/** How many mounted surfaces currently hide the tab bar (live match, win takeover, lobby). */
export const useTabBarHiders = create<{ count: number }>(() => ({ count: 0 }));

/** Hides the tab bar while the calling component is mounted. */
export function useHideTabBar(): void {
  useEffect(() => {
    useTabBarHiders.setState((s) => ({ count: s.count + 1 }));
    return () => useTabBarHiders.setState((s) => ({ count: s.count - 1 }));
  }, []);
}

export function useTabBarHidden(): boolean {
  return useTabBarHiders((s) => s.count > 0);
}
