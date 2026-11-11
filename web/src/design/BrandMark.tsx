import { useTranslation } from 'react-i18next';
import { uiLanguage } from '../i18n/index.ts';
import type { Language } from '../i18n/language.ts';

// Re-exported so existing imports keep working; the rule lives in i18n/language.ts.
export { brandLanguage, type Language as BrandLanguage } from '../i18n/language.ts';

type BrandMarkProps = {
  /** Overrides the i18n language (used by the design fixture to show both). */
  language?: Language;
  className?: string;
};

/** The hard-edged bolt (never rounded, always ink, never volt) followed by the wordmark. */
export function BrandMark({ language, className }: BrandMarkProps) {
  const { i18n } = useTranslation();
  const lang = language ?? uiLanguage(i18n);
  // The wordmark is the catalogue's brand name, read in the mark's own language.
  const wordmark = i18n.getFixedT(lang)('brand.name');

  // The accessible name is real text inside a lang span (so it is voiced in the right language);
  // the visible wordmark and the bolt are hidden from assistive tech to avoid a double read.
  return (
    <span className={['inline-flex items-center gap-2 text-ink', className].filter(Boolean).join(' ')}>
      <svg viewBox="0 0 12 16" width="0.75em" height="1em" aria-hidden="true" focusable="false">
        <polygon points="7,0 1,9 5,9 3,16 11,6 7,6 9,0" fill="currentColor" />
      </svg>
      <span aria-hidden="true" lang={lang}>
        {wordmark}
      </span>
      <span className="sr-only" lang={lang}>
        {wordmark}
      </span>
    </span>
  );
}
