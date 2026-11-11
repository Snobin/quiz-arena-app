import { useLayoutEffect, useRef, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageKey } from '../i18n/index.ts';
import { Link } from './Link.tsx';
import { usePathname } from './router.ts';
import { MeIcon, PlayIcon, RanksIcon, RoomsIcon } from './tabIcons.tsx';
import { useTabBarHidden } from './useHideTabBar.ts';

export type Tab = { path: string; label: MessageKey; Icon: ComponentType };

export const TABS: readonly Tab[] = [
  { path: '/', label: 'tab.play', Icon: PlayIcon },
  { path: '/rooms', label: 'tab.rooms', Icon: RoomsIcon },
  { path: '/ranks', label: 'tab.ranks', Icon: RanksIcon },
  { path: '/me', label: 'tab.me', Icon: MeIcon },
];

/** The tab a path belongs to: its own tab, or Play for any other path (unknown paths render Play). */
export function activeTab(pathname: string): string {
  return TABS.some((tab) => tab.path === pathname) ? pathname : '/';
}

const ITEM =
  'hit-target flex min-h-target-min min-w-[0] flex-1 flex-col items-center justify-center gap-1 px-1 py-1 text-tab-label';

/**
 * Bottom tab bar: fixed on card with a hairline top border. While visible it publishes its
 * height as `--fixed-bar-height`, so pages pad past it and focused items scroll clear of it.
 */
export function TabBar() {
  const { t } = useTranslation();
  const hidden = useTabBarHidden();
  const active = activeTab(usePathname());
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--fixed-bar-height', `${nav.offsetHeight}px`);
    publish();
    // Text scaling changes the bar's height; follow it where ResizeObserver exists.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(nav);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--fixed-bar-height');
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav
      ref={navRef}
      aria-label={t('nav.main')}
      className="fixed inset-x-[0] bottom-[0] z-10 border-t border-hairline bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex w-full max-w-[480px] px-gutter-card">
        {TABS.map(({ path, label, Icon }) => {
          const current = path === active;
          return (
            <li key={path} className="flex min-w-[0] flex-1">
              <Link
                to={path}
                aria-current={current ? 'page' : undefined}
                className={[ITEM, current ? 'font-bold text-ink' : 'text-muted'].join(' ')}
              >
                <Icon />
                <span>{t(label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
