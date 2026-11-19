import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageKey } from '../../i18n/index.ts';
import { searchParam } from '../../shell/router.ts';

type Outcome = 'cancelled' | 'failed';

const MESSAGE: Record<Outcome, MessageKey> = { cancelled: 'signIn.cancelled', failed: 'signIn.failed' };

function readOutcome(): Outcome | null {
  const value = searchParam('signin');
  return value === 'cancelled' || value === 'failed' ? value : null;
}

/**
 * The one-line result of a sign-in that did not finish, shown on the surface she started it from:
 * "Sign-in cancelled" (she backed out at Google) or "Sign-in didn't work". Read once from `?signin=`
 * and then removed from the address so a reload or share does not repeat it. Always text, never
 * colour alone; she stays a guest either way.
 */
export function SignInOutcomeNote() {
  const { t } = useTranslation();
  const [outcome] = useState(readOutcome);

  useEffect(() => {
    if (readOutcome() === null) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('signin');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  if (!outcome) return null;
  const failed = outcome === 'failed';
  return (
    <p
      data-testid="signin-outcome"
      role={failed ? 'alert' : 'status'}
      className={failed ? 'text-caption font-semibold text-brick' : 'text-caption text-muted'}
    >
      {t(MESSAGE[outcome])}
    </p>
  );
}
