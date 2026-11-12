import { useTranslation } from 'react-i18next';

/**
 * The BOT badge (FR19, AD-7): a small outline tag next to a bot's name. The catalogue text is
 * Latin in both languages, so it is always marked `lang="en"` to be voiced correctly.
 */
export function BotBadge() {
  const { t } = useTranslation();
  return (
    <span
      data-testid="bot-badge"
      className="inline-flex shrink-0 items-center rounded-sm border border-ink px-1 text-label font-bold text-ink"
    >
      <span lang="en">{t('badge.bot')}</span>
    </span>
  );
}
