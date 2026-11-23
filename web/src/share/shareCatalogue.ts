import i18n from 'i18next';
import { LANGUAGES, type Entry } from '../i18n/catalogue.ts';

/**
 * The result share card strings (Story 7.1). They live with the share code, not in the main catalogue, so the entry chunk does
 * not carry them: importing this module registers them with i18next, and `t()` stays typed through `ShareKey`. Same entry
 * shape and rules as `catalogue.ts`. Every Malayalam line is an [ASSUMPTION] awaiting voice sign-off; names are inserted
 * unchanged, never inflected.
 */
const both = ['ml', 'en'] as const;

export const shareCatalogue = {
  'share.button': { ml: 'പങ്കിടാം', en: 'Share', signoff: both },
  'share.rendering': { ml: '…', en: '…', signoff: both },
  'share.saved': { ml: 'ചിത്രം സേവ് ചെയ്തു · ലിങ്ക് കോപ്പി ചെയ്തു', en: 'Image saved · link copied', signoff: both },
  'share.savedLink': { ml: 'ചിത്രം സേവ് ചെയ്തു · ലിങ്ക്:', en: 'Image saved · link:', signoff: both },
  'share.failed': { ml: 'പങ്കിടാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.', en: "Couldn't share. Try again.", signoff: both },
  'share.offline': { ml: 'പങ്കിടാൻ ഓൺലൈൻ വേണം', en: 'Sharing needs a connection', signoff: both },
  'share.botName': { ml: 'മിന്നൽ ബോട്ട്', en: 'Minnal Bot', signoff: both },
  'share.cta': { ml: 'എന്നെ തോൽപ്പിക്കൂ', en: 'Beat me on Minnal', signoff: both },

  // The result line on the card (names unchanged, then a separator in Malayalam).
  'share.line.win': { ml: '{{name}} · ജയിച്ചു · {{rival}}', en: '{{name}} beat {{rival}}', signoff: both, params: { ml: { name: 'Anju', rival: 'Vishnu' }, en: { name: 'Anju', rival: 'Vishnu' } } },
  'share.line.loss': {
    ml: '{{rival}} · ജയിച്ചു · {{name}} {{score, number}}',
    en: '{{rival}} won · {{name}} {{score, number}}',
    signoff: both,
    params: { ml: { name: 'Anju', rival: 'Vishnu', score: 7420 }, en: { name: 'Anju', rival: 'Vishnu', score: 7420 } },
  },
  'share.line.draw': { ml: '{{name}} · സമനില · {{rival}}', en: '{{name}} drew with {{rival}}', signoff: both, params: { ml: { name: 'Anju', rival: 'Vishnu' }, en: { name: 'Anju', rival: 'Vishnu' } } },
  'share.line.roomWin': { ml: '{{name}} · ജയിച്ചു · {{total, number}} പേർ', en: '{{name}} won · {{total, number}} players', signoff: both, params: { ml: { name: 'Anju', total: 23 }, en: { name: 'Anju', total: 23 } } },
  'share.line.roomJoint': {
    ml: '{{name}} · സംയുക്ത ജയം · {{total, number}} പേർ',
    en: '{{name}} · joint win · {{total, number}} players',
    signoff: both,
    params: { ml: { name: 'Anju', total: 23 }, en: { name: 'Anju', total: 23 } },
  },
  'share.line.roomPlace': {
    ml: '{{name}} · {{place, number}}-ാം സ്ഥാനം · {{total, number}} പേരിൽ',
    en: '{{name}} came #{{place, number}} of {{total, number}}',
    signoff: both,
    params: { ml: { name: 'Anju', place: 3, total: 23 }, en: { name: 'Anju', place: 3, total: 23 } },
  },

  // The text that goes with the image in the share sheet.
  'share.text.win': {
    ml: '{{rival}}-നെ {{you, number}} – {{them, number}} എന്ന സ്കോറിന് ഞാൻ മിന്നലിൽ തോൽപ്പിച്ചു. എന്നെ തോൽപ്പിക്കൂ:',
    en: 'I beat {{rival}} {{you, number}} – {{them, number}} on Minnal. Beat me:',
    signoff: both,
    params: { ml: { rival: 'Vishnu', you: 7840, them: 7420 }, en: { rival: 'Vishnu', you: 7840, them: 7420 } },
  },
  'share.text.loss': {
    ml: '{{rival}} മിന്നലിൽ എന്നെ {{them, number}} – {{you, number}} എന്ന സ്കോറിന് തോൽപ്പിച്ചു. നിങ്ങൾക്ക് പറ്റുമോ:',
    en: '{{rival}} beat me {{them, number}} – {{you, number}} on Minnal. Beat me:',
    signoff: both,
    params: { ml: { rival: 'Vishnu', you: 7420, them: 7840 }, en: { rival: 'Vishnu', you: 7420, them: 7840 } },
  },
  'share.text.draw': {
    ml: '{{rival}}-നോട് {{you, number}} – {{them, number}} എന്ന സമനില മിന്നലിൽ. എന്നെ തോൽപ്പിക്കൂ:',
    en: 'I drew with {{rival}} {{you, number}} – {{them, number}} on Minnal. Beat me:',
    signoff: both,
    params: { ml: { rival: 'Vishnu', you: 7420, them: 7420 }, en: { rival: 'Vishnu', you: 7420, them: 7420 } },
  },
  'share.text.roomWin': {
    ml: '{{total, number}} പേരുടെ ബാറ്റിൽ റൂമിൽ ഞാൻ ജയിച്ചു. എന്നെ തോൽപ്പിക്കൂ:',
    en: 'I won a Battle Room of {{total, number}} on Minnal. Beat me:',
    signoff: both,
    params: { ml: { total: 23 }, en: { total: 23 } },
  },
  'share.text.roomJoint': {
    ml: '{{total, number}} പേരുടെ ബാറ്റിൽ റൂമിൽ ഞാൻ സംയുക്ത ജയം നേടി. എന്നെ തോൽപ്പിക്കൂ:',
    en: 'I shared the win in a Battle Room of {{total, number}} on Minnal. Beat me:',
    signoff: both,
    params: { ml: { total: 23 }, en: { total: 23 } },
  },
  'share.text.roomPlace': {
    ml: 'ബാറ്റിൽ റൂമിൽ {{total, number}} പേരിൽ {{place, number}}-ാം സ്ഥാനം. എന്നെ തോൽപ്പിക്കൂ:',
    en: 'I came #{{place, number}} of {{total, number}} in a Battle Room on Minnal. Beat me:',
    signoff: both,
    params: { ml: { place: 3, total: 23 }, en: { place: 3, total: 23 } },
  },
} as const satisfies Record<string, Entry>;

export type ShareKey = keyof typeof shareCatalogue;

for (const language of LANGUAGES) {
  const resources: Record<string, string> = {};
  for (const [key, entry] of Object.entries(shareCatalogue) as [ShareKey, Entry][]) {
    const value = entry[language];
    if (value !== null) resources[key] = value;
  }
  i18n.addResourceBundle(language, 'translation', resources, true, true);
}
