import { useTranslation } from 'react-i18next';
import { PageColumn } from '../../design/PageColumn.tsx';
import { useDocumentTitle } from '../../i18n/useDocumentTitle.ts';
import { Link } from '../../shell/Link.tsx';

/** What a signed-in player without the ADMIN role sees at /admin. It lives in the player bundle; the admin chunk is never requested. */
export function NotAuthorised() {
  const { t } = useTranslation();
  useDocumentTitle(t('title.notAuthorised'));
  return (
    <PageColumn className="py-4">
      <main className="flex flex-col items-start gap-3">
        <h1 tabIndex={-1} className="font-title text-title">
          {t('notAuthorised.title')}
        </h1>
        <p>{t('notAuthorised.body')}</p>
        <Link to="/" className="hit-target inline-flex min-h-target-min items-center rounded-md text-body font-semibold text-ink underline">
          {t('common.home')}
        </Link>
      </main>
    </PageColumn>
  );
}
