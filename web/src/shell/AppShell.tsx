import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { LiveRegions } from './LiveRegions.tsx';
import { OfflineBanner } from './OfflineBanner.tsx';
import { usePathname, useRouter } from './router.ts';
import { consumeReturnFocus } from './returnFocus.ts';
import { deferScreenFocus, pendingAttr, screenHeading } from './ScreenReady.tsx';
import { recallScroll, rememberScroll } from './scrollMemory.ts';
import { TabBar } from './TabBar.tsx';

/**
 * The player shell: shared live regions, the offline banner, the routed screen and the tab bar.
 * Each path keeps its scroll offset and gets it back on return.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => rememberScroll(useRouter.getState().pathname, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const shownPath = useRef(pathname);

  // Before paint, so the returning tab never flashes at the wrong offset. After a navigation
  // (never on first load) focus moves to the new screen's heading, so screen-reader users hear
  // the new page; preventScroll keeps the restored offset. A pending return-focus target (the row
  // or button that opened a detour such as the Sign-in prompt) takes precedence over the heading.
  useLayoutEffect(() => {
    window.scrollTo(0, recallScroll(pathname));
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    const target = consumeReturnFocus(pathname) ?? document.querySelector<HTMLElement>(screenHeading);
    if (target) target.focus({ preventScroll: true });
    // A lazy screen still loading shows only its fallback: ScreenReady finishes the move once it mounts.
    else if (document.querySelector(`main h1[${pendingAttr}]`)) deferScreenFocus();
  }, [pathname]);

  return (
    <>
      <LiveRegions />
      <OfflineBanner />
      {children}
      <TabBar />
    </>
  );
}
