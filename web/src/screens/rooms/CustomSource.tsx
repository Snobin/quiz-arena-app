import { useTranslation } from 'react-i18next';
import { detectLanguage } from '../../i18n/Lang.tsx';
import './roomCatalogue.ts';

/** The "സ്വന്തം" outline tag: ink outline, small radius, no volt (UX-DR51). */
export function OwnTag() {
  const { t } = useTranslation();
  return (
    <span data-testid="own-tag" lang="ml" className="rounded-sm border border-ink px-2 py-[2px] text-label font-semibold text-ink">
      {t('rooms.custom.tag')}
    </span>
  );
}

/**
 * A custom source's row body (Create and the lobby, host and players alike): the topic name, the tag and the unrated note
 * up front, before Start. The block's accessible name includes "unrated".
 */
export function CustomSourceRow({ name }: { name: string }) {
  const { t } = useTranslation();
  return (
    <div data-testid="custom-source" role="group" aria-label={t('rooms.custom.a11y', { topic: name })} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <p lang={detectLanguage(name)} className="min-w-[0] break-words text-body font-semibold text-ink">
          {name}
        </p>
        <OwnTag />
      </div>
      <p className="text-caption text-muted">{t('rooms.custom.note')}</p>
    </div>
  );
}
