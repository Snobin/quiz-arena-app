import { useTranslation } from 'react-i18next';
import { PageColumn } from '../design/PageColumn.tsx';
import type { MessageKey } from '../i18n/index.ts';
import { useDocumentTitle } from '../i18n/useDocumentTitle.ts';

/** A tab that has no surface yet: its heading plus one line in voice. */
export function PlaceholderScreen({ heading: headingKey, line }: { heading: MessageKey; line: MessageKey }) {
  const { t } = useTranslation();
  const heading = t(headingKey);
  useDocumentTitle(heading);
  return (
    <PageColumn className="py-6">
      <main className="flex flex-col gap-2">
        <h1 tabIndex={-1} className="text-card-title font-card-title">{heading}</h1>
        <p>{t(line)}</p>
      </main>
    </PageColumn>
  );
}
