import i18n from 'i18next';
import { LANGUAGES, type Entry } from '../../i18n/catalogue.ts';

/**
 * The install card strings (Story 7.2). They live with the lazy results card, not in the main catalogue, so the entry chunk
 * does not carry them (same mechanism as `practiseCatalogue.ts`). Every Malayalam line is an [ASSUMPTION] awaiting sign-off.
 */
const both = ['ml', 'en'] as const;

export const installCatalogue = {
  'install.benefit': {
    ml: 'മിന്നൽ ഹോം സ്ക്രീനിൽ ചേർക്കൂ · ഒറ്റ ടാപ്പിൽ തുറക്കും, വേഗത കുറഞ്ഞ ഡാറ്റയിലും',
    en: 'Add Minnal to your home screen · it opens in one tap, even on slow data',
    signoff: both,
  },
  'install.button': { ml: 'ഇൻസ്റ്റാൾ', en: 'Install', signoff: both },
  'install.notNow': { ml: 'ഇപ്പോൾ വേണ്ട', en: 'Not now', signoff: both },
  'install.ios': {
    ml: 'ഷെയർ ടാപ്പ് ചെയ്യൂ, പിന്നെ "ഹോം സ്ക്രീനിൽ ചേർക്കുക" തിരഞ്ഞെടുക്കൂ',
    en: 'Tap Share, then Add to Home Screen',
    signoff: both,
  },
  'install.gotIt': { ml: 'മനസ്സിലായി', en: 'Got it', signoff: both },
  'install.done': { ml: 'മിന്നൽ ഇൻസ്റ്റാൾ ചെയ്തു', en: 'Minnal installed', signoff: both },
} as const satisfies Record<string, Entry>;

export type InstallKey = keyof typeof installCatalogue;

for (const language of LANGUAGES) {
  const resources: Record<string, string> = {};
  for (const [key, entry] of Object.entries(installCatalogue) as [InstallKey, Entry][]) {
    const value = entry[language];
    if (value !== null) resources[key] = value;
  }
  i18n.addResourceBundle(language, 'translation', resources, true, true);
}
