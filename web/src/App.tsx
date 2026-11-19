import { lazy, Suspense, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useSession } from './auth/session.ts';
import { ensureProfileLoaded, resetProfile, useProfile } from './profile/profileStore.ts';
import { ProfileSetup } from './screens/profile/ProfileSetup.tsx';
import { PageColumn } from './design/PageColumn.tsx';
import { AuthReturn } from './screens/AuthReturn.tsx';
import { MeScreen } from './screens/MeScreen.tsx';
import { GuestHome } from './screens/home/GuestHome.tsx';
import { RegisteredHome } from './screens/home/RegisteredHome.tsx';
import { LiveMatchScreen } from './screens/match/LiveMatchScreen.tsx';
import { MatchmakingScreen } from './screens/matchmaking/MatchmakingScreen.tsx';
import { RanksScreen } from './screens/RanksScreen.tsx';
import { ResultsScreen } from './screens/results/ResultsScreen.tsx';
import { RoomsScreen } from './screens/RoomsScreen.tsx';
import { SignInPrompt } from './screens/SignInPrompt.tsx';
import { AppShell } from './shell/AppShell.tsx';
import { navigate, usePathname, useRouterSync } from './shell/router.ts';
import { safeReturnPath } from './screens/home/signInPath.ts';

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

/** Shell routes: static paths only. Unknown paths render Play (Home). */
const ROUTES: Record<string, ComponentType> = {
  '/': Home,
  '/auth/return': AuthReturn,
  '/rooms': RoomsScreen,
  '/ranks': RanksScreen,
  '/me': MeScreen,
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

  const Screen = ROUTES[pathname] ?? Home;
  // One element for every way of reaching setup, so the form is never remounted (and typed input never lost)
  // when the profile finishes loading.
  const screen =
    profileLoading ? (
      <HomePending />
    ) : needsSetup || (pathname === '/profile/setup' && !setupNotNeeded) ? (
      <ProfileSetup to={pathname === '/profile/setup' ? (new URLSearchParams(window.location.search).get('to') ?? '/') : `${pathname}${window.location.search}`} />
    ) : (
      <Screen />
    );
  return (
    <AppShell>
      {screen}
    </AppShell>
  );
}
