import { useTranslation } from 'react-i18next';
import { useSession } from '../auth/session.ts';
import { PageColumn } from '../design/PageColumn.tsx';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { lazyWithRetry } from '../shell/lazyWithRetry.ts';
import { SignInNudge } from './home/SignInNudge.tsx';
import './rooms/roomCatalogue.ts';

// The real tab (Create, Join, recents) loads only for a registered player.
const RoomsTab = lazyWithRetry(() => import('./rooms/RoomsTab.tsx'));

/** A guest's Rooms tab: one line about Battle Room and the one Sign-in nudge, which comes back here. */
function GuestRooms() {
  const { t } = useTranslation();
  useDocumentTitle(t('tab.rooms'));
  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('tab.rooms')}
        </h1>
        <p className="text-body">{t('rooms.guest.line')}</p>
        <SignInNudge returnTo="/rooms" />
      </main>
    </PageColumn>
  );
}

function Pending() {
  const { t } = useTranslation();
  return (
    <PageColumn className="py-4">
      <main>
        <h1 tabIndex={-1} className="sr-only">
          {t('common.loading')}
        </h1>
      </main>
    </PageColumn>
  );
}

/** The Rooms tab: guest or registered (Story 5.2 replaces the Story 1.3 placeholder). */
export function RoomsScreen() {
  const status = useSession((s) => s.status);
  // The lazy tab suspends into the app's own boundary, which also hands focus to its heading once it mounts.
  if (status === 'registered') return <RoomsTab />;
  return status === 'booting' ? <Pending /> : <GuestRooms />;
}
