import i18n, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resourcesFor } from './catalogue.ts';
import { LANGUAGES, brandLanguage, preferredLanguage, type Language } from './language.ts';
import { formatNumber, formatSigned } from './format.ts';

export { pendingSignoff, catalogue, type CatalogueKey, type MessageKey } from './catalogue.ts';
export { LANGUAGES, brandLanguage, deviceLanguage, preferredLanguage, storeLanguage, type Language } from './language.ts';
export { formatNumber, formatSigned } from './format.ts';

/**
 * The UI language as the strings resolve it (resolvedLanguage), normalised to ml | en. Use this,
 * not `i18n.language`, so `<html lang>`, `<Lang>` and the wordmark always agree with the copy.
 */
export function uiLanguage(instance: I18n = i18n): Language {
  return brandLanguage(instance.resolvedLanguage ?? instance.language);
}

function syncHtmlLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = uiLanguage();
}

// Registered before init so the initial languageChanged event also syncs <html lang>.
i18n.on('languageChanged', syncHtmlLang);

const resources = Object.fromEntries(
  LANGUAGES.map((language) => [language, { translation: resourcesFor(language) }]),
);

// Guests start in the device language: Malayalam when any preferred language is ml*, else English.
void i18n.use(initReactI18next).init({
  resources,
  lng: preferredLanguage(),
  supportedLngs: [...LANGUAGES],
  load: 'languageOnly',
  // TBD strings in one language fall back to the other; any other language resolves to ml
  // (the same rule as brandLanguage).
  fallbackLng: { ml: ['en'], en: ['ml'], default: ['ml'] },
  // Flat catalogue keys ('match.locked'); the dot is part of the key.
  keySeparator: false,
  nsSeparator: false,
  returnEmptyString: true,
  interpolation: { escapeValue: false },
  initAsync: false,
});

// Interpolated numbers: Latin digits, Indian grouping, in both UI languages.
i18n.services.formatter?.add('number', (value: unknown) =>
  typeof value === 'number' ? formatNumber(value) : String(value),
);
i18n.services.formatter?.add('signed', (value: unknown) =>
  typeof value === 'number' ? formatSigned(value) : String(value),
);

syncHtmlLang();

export default i18n;
