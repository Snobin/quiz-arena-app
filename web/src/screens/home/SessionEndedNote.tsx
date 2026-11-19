import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';

/**
 * "Please sign in again": the server ended her session (a refresh token was reused, expired or
 * revoked), so she is a guest until she signs in. Plain text in a polite status region; nothing is
 * said after an ordinary boot with no session.
 */
export function SessionEndedNote() {
  const { t } = useTranslation();
  const signedOut = useSession((s) => s.signedOut);
  if (!signedOut) return null;
  return (
    <p data-testid="session-ended" role="status" className="text-caption text-muted">
      {t('auth.signInAgain')}
    </p>
  );
}
