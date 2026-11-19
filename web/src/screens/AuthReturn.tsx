import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n.ts';
import { session } from '../auth/session.ts';
import { PageColumn } from '../design/PageColumn.tsx';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';
import { announce } from '../shell/announce.ts';
import { navigate, searchParam } from '../shell/router.ts';
import { safeReturnPath } from './home/signInPath.ts';

/** `to` with `signin=failed` added to its query (before any fragment). */
function withFailure(path: string): string {
  const hash = path.indexOf('#');
  const base = hash < 0 ? path : path.slice(0, hash);
  const fragment = hash < 0 ? '' : path.slice(hash);
  return `${base}${base.includes('?') ? '&' : '?'}signin=failed${fragment}`;
}

/**
 * `/auth/return?to=<path>`: where core sends the browser after a successful Google sign-in. The
 * refresh cookie is already set; this waits for the session to trade it for an access token, then
 * restores the surface she started from (`to`, re-validated as an in-app path). AppShell moves
 * focus to that surface's heading; "Signed in as <name>" is announced once through the shared polite
 * region. If the session did not come up it goes back to the surface with the one-line failure note.
 */
export function AuthReturn() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.signingIn'));
  // StrictMode mounts effects twice; the announcement and the redirect must happen once.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const requested = safeReturnPath(searchParam('to'));
    const to = requested.startsWith('/auth/return') ? '/' : requested;
    void session.confirmSignedIn().then(() => {
      const { status, name } = session.store.getState();
      if (status === 'registered') {
        // The name is inserted unchanged; the text is built here so it is announced after the move.
        announce(i18n.t('auth.signedInAs', { name: name ?? i18n.t('home.registeredHeaderNoName') }));
        navigate(to, { replace: true });
      } else {
        navigate(withFailure(to), { replace: true });
      }
    });
  }, []);

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('auth.signingIn')}
        </h1>
      </main>
    </PageColumn>
  );
}
