import { lazy, Suspense, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSession } from './auth/session.ts';
import { ensureProfileLoaded, resetProfile, useProfile } from './profile/profileStore.ts';
import { PageColumn } from './design/PageColumn.tsx';
import { GuestHome } from './screens/home/GuestHome.tsx';
import { RegisteredHome } from './screens/home/RegisteredHome.tsx';
import { ChunkErrorBoundary } from './shell/ChunkErrorBoundary.tsx';
import { lazyWithRetry } from './shell/lazyWithRetry.ts';
import { AppShell } from './shell/AppShell.tsx';
import { pendingAttr, ScreenReady } from './shell/ScreenReady.tsx';
import { navigate, usePathname, useRouterSync } from './shell/router.ts';
import { AdminRoute } from './screens/admin/AdminRoute.tsx';
import { safeReturnPath } from './screens/home/signInPath.ts';

// Screens reached after first paint load on demand (entry budget).
const LiveMatchScreen = lazyWithRetry(() => import('./screens/match/LiveMatchScreen.tsx').then((m) => ({ default: m.LiveMatchScreen })));
const MatchmakingScreen = lazyWithRetry(() => import('./screens/matchmaking/MatchmakingScreen.tsx').then((m) => ({ default: m.MatchmakingScreen })));
const RanksScreen = lazyWithRetry(() => import('./screens/RanksScreen.tsx').then((m) => ({ default: m.RanksScreen })));
const ResultsScreen = lazyWithRetry(() => import('./screens/results/ResultsScreen.tsx').then((m) => ({ default: m.ResultsScreen })));
const RoomsScreen = lazyWithRetry(() => import('./screens/RoomsScreen.tsx').then((m) => ({ default: m.RoomsScreen })));
const SettingsScreen = lazyWithRetry(() => import('./screens/SettingsScreen.tsx').then((m) => ({ default: m.SettingsScreen })));
const MeScreen = lazyWithRetry(() => import('./screens/MeScreen.tsx').then((m) => ({ default: m.MeScreen })));
const SignInPrompt = lazyWithRetry(() => import('./screens/SignInPrompt.tsx').then((m) => ({ default: m.SignInPrompt })));

const ProfileSetup = lazyWithRetry(() => import('./screens/profile/ProfileSetup.tsx').then((m) => ({ default: m.ProfileSetup })));

const AuthReturn = lazyWithRetry(() => import('./screens/AuthReturn.tsx').then((m) => ({ default: m.AuthReturn })));

// The topic picker and the Duel and Solo stubs load only when opened (entry budget). Paths are matched by prefix.
const TopicsRoutes = lazyWithRetry(() => import('./screens/topics/TopicsRoutes.tsx'));
// Battle Room Create and the host lobby (Story 5.2) load on demand too; `/rooms` itself is RoomsScreen's.
const RoomsRoutes = lazyWithRetry(() => import('./screens/rooms/RoomsRoutes.tsx'));
const isRoomsPath = (pathname: string) => pathname === '/rooms/create' || pathname.startsWith('/r/');
const isTopicsPath = (pathname: string) => pathname === '/play/topics' || pathname.startsWith('/play/duel/') || pathname.startsWith('/practice/');

/**
 * Home for whoever is using the app: guest Home, or the registered player's. While the boot refresh is
 * in flight it shows only the heading, so a returning player never sees the guest Home flash by.
 */
function Home() {
  const status = useSession((s) => s.status);
  if (status === 'registered') return <RegisteredHome />;
  if (status === 'booting') return <HomePending />;
  return <GuestHome />;
}

function HomePending() {
  const { t } = useTranslation();
  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="sr-only">
          {t('common.loading')}
        </h1>
      </main>
    </PageColumn>
  );
}

/** Suspense fallback while a screen's chunk loads: heading only (no flash), not a focus target. */
function ScreenPending() {
  const { t } = useTranslation();
  const pending = { [pendingAttr]: '' };
  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="sr-only" {...pending}>
          {t('common.loading')}
        </h1>
      </main>
    </PageColumn>
  );
}

/** Shell routes: static paths only. Unknown paths render Play (Home). */
const ROUTES: Record<string, ComponentType> = {
  '/': Home,
  '/auth/return': AuthReturn,
  '/rooms': RoomsScreen,
  '/ranks': RanksScreen,
  '/me': MeScreen,
  '/settings': SettingsScreen,
  '/sign-in': SignInPrompt,
  '/matchmaking': MatchmakingScreen,
  '/match': LiveMatchScreen,
  '/results': ResultsScreen,
};

// Dev-only QA fixtures, rendered outside the shell. `import.meta.env.DEV` is a build-time
// constant, so the fixtures are dropped from production bundles entirely (check:dist verifies).
const FIXTURES: Record<string, ComponentType> = import.meta.env.DEV
  ? {
      '/__design': lazy(() => import('./design/DesignFixture.tsx')),
      '/__shaping': lazy(() => import('./design/ShapingFixture.tsx')),
      '/__flash': lazy(() => import('./design/FlashFixture.tsx')),
    }
  : {};

export function App() {
  useRouterSync();
  const pathname = usePathname();
  const status = useSession((s) => s.status);
  const profileStatus = useProfile((s) => s.status);
  const profileReady = profileStatus === 'ready';
  const profileComplete = useProfile((s) => s.profile?.profileComplete ?? false);
  const queryClient = useQueryClient();
  const wasRegistered = useRef(false);
  useEffect(() => {
    // Her ratings, history and leaderboard position belong to her: nothing is kept for the next account on this tab. Only
    // when she actually stops being signed in (not on first render, where a guest's board request may be in flight).
    if (wasRegistered.current && status !== 'registered') {
      queryClient.removeQueries({ queryKey: ['ratings'] });
      queryClient.removeQueries({ queryKey: ['matches'] });
      queryClient.removeQueries({ queryKey: ['leaderboard'] });
      queryClient.removeQueries({ queryKey: ['topics'] });
      queryClient.removeQueries({ queryKey: ['recentTopics'] });
    }
    wasRegistered.current = status === 'registered';
    if (status === 'registered') void ensureProfileLoaded();
    else if (status === 'guest') resetProfile();
  }, [status]);

  // Registered, profile not known yet: hold the screen (setup may be next) rather than flash the requested one.
  const profileLoading = status === 'registered' && (profileStatus === 'idle' || profileStatus === 'loading') && pathname !== '/auth/return';
  // /profile/setup is for a registered player who has not finished it; anyone else is sent on.
  const setupNotNeeded = pathname === '/profile/setup' && (status === 'guest' || (profileReady && profileComplete));
  useEffect(() => {
    if (setupNotNeeded) navigate(safeReturnPath(new URLSearchParams(window.location.search).get('to')), { replace: true });
  }, [setupNotNeeded]);

  // A registered player who has not finished setup sees it before any other surface (not mid-sign-in).
  const needsSetup = status === 'registered' && profileReady && !profileComplete && pathname !== '/auth/return';

  const Fixture = FIXTURES[pathname];
  if (Fixture) {
    return (
      <Suspense fallback={null}>
        <Fixture />
      </Suspense>
    );
  }

  // The admin console is outside the player shell (no tab bar); its guard decides who may load it.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return <AdminRoute />;

  const Screen = ROUTES[pathname] ?? (isTopicsPath(pathname) ? TopicsRoutes : isRoomsPath(pathname) ? RoomsRoutes : Home);
  // One element for every way of reaching setup, so the form is never remounted (and typed input never lost)
  // when the profile finishes loading.
  const screen =
    profileLoading ? (
      <HomePending />
    ) : needsSetup || (pathname === '/profile/setup' && !setupNotNeeded) ? (
      <ChunkErrorBoundary key="setup">
        <Suspense fallback={<ScreenPending />}>
          <ProfileSetup to={pathname === '/profile/setup' ? (new URLSearchParams(window.location.search).get('to') ?? '/') : `${pathname}${window.location.search}`} />
          <ScreenReady />
        </Suspense>
      </ChunkErrorBoundary>
    ) : (
      <ChunkErrorBoundary key={pathname}>
        <Suspense fallback={<ScreenPending />}>
          <Screen />
          <ScreenReady />
        </Suspense>
      </ChunkErrorBoundary>
    );
  return (
    <AppShell>
      {screen}
    </AppShell>
  );
}
