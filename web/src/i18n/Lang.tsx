import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { uiLanguage } from './index.ts';
import type { Language } from './language.ts';

const MALAYALAM_SCRIPT = /[ഀ-ൿ]/;

/** Script detection: any Malayalam character makes the run Malayalam, otherwise English. */
export function detectLanguage(text: string): Language {
  return MALAYALAM_SCRIPT.test(text) ? 'ml' : 'en';
}

type LangProps =
  | { lang: Language; children: ReactNode }
  | { lang?: undefined; children: string };

/**
 * Marks a run whose language differs from the UI language (a Latin name inside Malayalam UI, a
 * Malayalam run in English UI) with `<span lang>`, so it is voiced correctly. Same-language runs
 * render bare. Without an explicit `lang`, the language is detected from the script.
 */
export function Lang({ lang, children }: LangProps) {
  const { i18n } = useTranslation();
  const language = lang ?? detectLanguage(children as string);
  if (language === uiLanguage(i18n)) return <>{children}</>;
  return <span lang={language}>{children}</span>;
}
