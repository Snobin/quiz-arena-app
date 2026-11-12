/** The two UI languages. */
export type Language = 'ml' | 'en';

export const LANGUAGES = ['ml', 'en'] as const satisfies readonly Language[];

/** English for any `en` locale (case-insensitive: en, EN, en-US, en_IN); anything else is Malayalam. */
export function brandLanguage(language: string | undefined): Language {
  return language !== undefined && /^en(?:[-_]|$)/i.test(language) ? 'en' : 'ml';
}

/** The browser's preferred languages (navigator.languages, else navigator.language), or none. */
function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/**
 * The guest's UI language from the device (EXPERIENCE.md › Bilingual Behavior): Malayalam when any
 * preferred language is Malayalam (ml, ml-IN, ml_IN, any case), otherwise English. It sets the i18n
 * language, `<html lang>` and the guest-token `lang`; nothing is persisted (the Settings control
 * arrives in Epic 2). Not for normalising i18n languages: that is `brandLanguage`.
 */
export function deviceLanguage(languages: readonly string[] = browserLanguages()): Language {
  return languages.some((language) => /^ml(?:[-_]|$)/i.test(language)) ? 'ml' : 'en';
}
