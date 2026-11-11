import { useTranslation } from 'react-i18next';

export type BrandLanguage = 'ml' | 'en';

const WORDMARK: Record<BrandLanguage, string> = { ml: 'മിന്നൽ', en: 'Minnal' };

/** English for any `en` locale (case-insensitive: en, EN, en-US, en_IN); anything else is Malayalam. */
export function brandLanguage(language: string | undefined): BrandLanguage {
  return language !== undefined && /^en(?:[-_]|$)/i.test(language) ? 'en' : 'ml';
}

type BrandMarkProps = {
  /** Overrides the i18n language (used by the design fixture to show both). */
  language?: BrandLanguage;
  className?: string;
};

/** The hard-edged bolt (never rounded, always ink, never volt) followed by the wordmark. */
export function BrandMark({ language, className }: BrandMarkProps) {
  const { i18n } = useTranslation();
  const lang = language ?? brandLanguage(i18n.language);
  const wordmark = WORDMARK[lang];

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
