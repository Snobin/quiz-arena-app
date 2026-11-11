import { lazy, Suspense, type ComponentType } from 'react';
import { MeScreen } from './screens/MeScreen.tsx';
import { PlayScreen } from './screens/PlayScreen.tsx';
import { RanksScreen } from './screens/RanksScreen.tsx';
import { RoomsScreen } from './screens/RoomsScreen.tsx';
import { AppShell } from './shell/AppShell.tsx';
import { usePathname, useRouterSync } from './shell/router.ts';

/** Shell routes: static paths only. Unknown paths render Play. */
const ROUTES: Record<string, ComponentType> = {
  '/': PlayScreen,
  '/rooms': RoomsScreen,
  '/ranks': RanksScreen,
  '/me': MeScreen,
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

  const Screen = ROUTES[pathname] ?? PlayScreen;
  return (
    <AppShell>
      <Screen />
    </AppShell>
  );
}
