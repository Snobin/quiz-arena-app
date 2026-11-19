import { useTranslation } from 'react-i18next';
import { useAccountNotice } from '../../auth/accountNotice.ts';

/** "Your account was deleted": one polite line on guest Home after deletion. */
export function AccountDeletedNote() {
  const { t } = useTranslation();
  const deleted = useAccountNotice((s) => s.deleted);
  if (!deleted) return null;
  return (
    <p data-testid="account-deleted" role="status" className="text-caption text-muted">
      {t('settings.deleted')}
    </p>
  );
}
