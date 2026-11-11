/** The two UI languages. */
export type Language = 'ml' | 'en';

export const LANGUAGES = ['ml', 'en'] as const satisfies readonly Language[];

/** English for any `en` locale (case-insensitive: en, EN, en-US, en_IN); anything else is Malayalam. */
export function brandLanguage(language: string | undefined): Language {
  return language !== undefined && /^en(?:[-_]|$)/i.test(language) ? 'en' : 'ml';
}
