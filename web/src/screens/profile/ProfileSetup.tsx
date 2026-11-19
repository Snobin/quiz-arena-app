import { useTranslation } from 'react-i18next';
import { useSession } from '../../auth/session.ts';
import { PageColumn } from '../../design/PageColumn.tsx';
import { uiLanguage } from '../../i18n/index.ts';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { prefillName } from '../../profile/nameRule.ts';
import { navigate } from '../../shell/router.ts';
import { safeReturnPath } from '../home/signInPath.ts';
import { ProfileForm } from './ProfileForm.tsx';

/**
 * First-time profile setup (FR6): one screen with visible labels and one Save. It opens first for a
 * registered player without a profile, wherever she was going; after Save she goes on to `to`. The
 * display name is prefilled from her Google first name only when it passes the name rule.
 */
export function ProfileSetup({ to }: { to: string }) {
  const { t } = useTranslation();
  useDocumentTitle(t('profile.setup.title'));
  const givenName = useSession((s) => s.name);
  const target = safeReturnPath(to);

  return (
    <PageColumn className="py-4">
      <main className="flex flex-col gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('profile.setup.title')}
        </h1>
        <ProfileForm
          initial={{ displayName: prefillName(givenName), district: '', examLevel: '', language: uiLanguage() }}
          onSaved={() => navigate(target === '/profile/setup' ? '/' : target, { replace: true })}
        />
      </main>
    </PageColumn>
  );
}
