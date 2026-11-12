import { lazy, Suspense, type ComponentType } from 'react';
import { MeScreen } from './screens/MeScreen.tsx';
import { GuestHome } from './screens/home/GuestHome.tsx';
import { LiveMatchScreen } from './screens/match/LiveMatchScreen.tsx';
import { MatchmakingScreen } from './screens/matchmaking/MatchmakingScreen.tsx';
import { RanksScreen } from './screens/RanksScreen.tsx';
import { ResultsScreen } from './screens/results/ResultsScreen.tsx';
import { RoomsScreen } from './screens/RoomsScreen.tsx';
import { SignInPrompt } from './screens/SignInPrompt.tsx';
import { AppShell } from './shell/AppShell.tsx';
import { usePathname, useRouterSync } from './shell/router.ts';

/** Shell routes: static paths only. Unknown paths render Play (guest Home). */
const ROUTES: Record<string, ComponentType> = {
  '/': GuestHome,
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

  const Fixture = FIXTURES[pathname];
  if (Fixture) {
    return (
      <Suspense fallback={null}>
        <Fixture />
      </Suspense>
    );
  }

  const Screen = ROUTES[pathname] ?? GuestHome;
  return (
    <AppShell>
      <Screen />
    </AppShell>
  );
}
