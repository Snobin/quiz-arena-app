import i18n from 'i18next';
import { LANGUAGES, type Entry } from '../../i18n/catalogue.ts';

/**
 * The "Practise this topic" strings (Story 4.4). They live with the lazy link, not in the main catalogue, so the entry
 * chunk does not carry them (same mechanism as `practiceCatalogue.ts`).
 */
export const practiseCatalogue = {
  'practise.link': { ml: 'ഈ ടോപ്പിക് പരിശീലിക്കൂ', en: 'Practise this topic', signoff: ['ml', 'en'] },
  'practise.label': {
    ml: 'ഈ ടോപ്പിക് പരിശീലിക്കൂ, ചോദ്യം {{n, number}}',
    en: 'Practise this topic, question {{n, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { n: 3 }, en: { n: 3 } },
  },
  'practise.error': { ml: 'പരിശീലനം തുടങ്ങാനായില്ല.', en: "Couldn't start practice.", signoff: ['ml', 'en'] },
  'practise.retry': { ml: 'വീണ്ടും ശ്രമിക്കൂ', en: 'Retry', signoff: ['ml', 'en'] },
} as const satisfies Record<string, Entry>;

export type PractiseKey = keyof typeof practiseCatalogue;

for (const language of LANGUAGES) {
  const resources: Record<string, string> = {};
  for (const [key, entry] of Object.entries(practiseCatalogue) as [PractiseKey, Entry][]) {
    const value = entry[language];
    if (value !== null) resources[key] = value;
  }
  i18n.addResourceBundle(language, 'translation', resources, true, true);
}
