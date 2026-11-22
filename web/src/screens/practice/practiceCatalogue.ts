import i18n from 'i18next';
import { LANGUAGES, type Entry } from '../../i18n/catalogue.ts';

/**
 * The Solo Practice strings (Story 4.3). They live with the screen, not in the main catalogue, so the entry chunk does
 * not carry them: importing this module (the practice chunk does) registers them with i18next, and `t()` stays typed
 * through `PracticeKey`. Same entry shape and rules as `catalogue.ts`.
 */
export const practiceCatalogue = {
  'title.practice': {
    ml: 'പരിശീലനം · {{topic}}',
    en: 'Practice · {{topic}}',
    signoff: ['ml', 'en'],
    params: { ml: { topic: 'കേരള ചരിത്രം' }, en: { topic: 'Kerala History' } },
  },
  'title.practiceBare': { ml: 'പരിശീലനം', en: 'Practice', signoff: ['ml', 'en'] },
  'practice.label': { ml: 'പരിശീലനം', en: 'Practice', signoff: ['ml', 'en'] },
  'practice.stop': { ml: 'നിർത്തുക', en: 'Stop', signoff: ['ml', 'en'] },
  'practice.tally': {
    ml: '{{answered, number}} ഉത്തരം · {{correct, number}} ശരി',
    en: '{{answered, number}} answered · {{correct, number}} correct',
    signoff: ['ml', 'en'],
    params: { ml: { answered: 12, correct: 9 }, en: { answered: 12, correct: 9 } },
  },
  'practice.position': {
    ml: 'ചോദ്യം {{n, number}} · പരിശീലനം',
    en: 'Question {{n, number}} · Practice',
    signoff: ['ml', 'en'],
    params: { ml: { n: 13 }, en: { n: 13 } },
  },
  'practice.reshuffled': {
    ml: 'ഈ ടോപ്പിക്കിലെ എല്ലാ ചോദ്യവും കഴിഞ്ഞു · പുതിയ ക്രമത്തിൽ വീണ്ടും',
    en: "You've seen every question in this topic. Starting again in a new order.",
    signoff: ['ml', 'en'],
  },
  'practice.result.correct': { ml: 'ശരി!', en: 'Correct!', signoff: ['ml', 'en'] },
  'practice.result.wrong': {
    ml: 'ശരി: {{answer}}',
    en: 'Answer: {{answer}}',
    signoff: ['ml', 'en'],
    params: { ml: { answer: 'പെരിയാർ' }, en: { answer: 'Periyar' } },
  },
  'practice.announce.correct': {
    ml: 'ശരി. ഉത്തരം: {{answer}}',
    en: 'Correct. Answer: {{answer}}',
    signoff: ['ml', 'en'],
    params: { ml: { answer: 'പെരിയാർ' }, en: { answer: 'Periyar' } },
  },
  'practice.announce.wrong': {
    ml: 'തെറ്റ്. ഉത്തരം: {{answer}}',
    en: 'Wrong. Answer: {{answer}}',
    signoff: ['ml', 'en'],
    params: { ml: { answer: 'പെരിയാർ' }, en: { answer: 'Periyar' } },
  },
  'practice.next': { ml: 'അടുത്തത്', en: 'Next', signoff: ['ml', 'en'] },
  'practice.summary.heading': { ml: 'പരിശീലനം കഴിഞ്ഞു', en: 'Practice finished', signoff: ['ml', 'en'] },
  'practice.again': { ml: 'വീണ്ടും പരിശീലിക്കാം', en: 'Practise again', signoff: ['ml', 'en'] },
  'practice.chooseTopic': { ml: 'മറ്റൊരു ടോപ്പിക് തിരഞ്ഞെടുക്കൂ', en: 'Choose another topic', signoff: ['ml', 'en'] },
  'practice.expired': { ml: 'ഈ പരിശീലന സെഷന്റെ സമയം കഴിഞ്ഞു', en: 'This practice session timed out', signoff: ['ml', 'en'] },
  'practice.startAgain': { ml: 'വീണ്ടും തുടങ്ങാം', en: 'Start again', signoff: ['ml', 'en'] },
  'practice.error.generic': { ml: 'പരിശീലനം ലോഡ് ചെയ്യാനായില്ല.', en: "Couldn't load practice.", signoff: ['ml', 'en'] },
  'practice.error.answer': { ml: 'ഉത്തരം അയയ്ക്കാനായില്ല.', en: "Couldn't send your answer.", signoff: ['ml', 'en'] },
  // Story 6.4: Solo Practice on a player's own custom topic, and its row in the solo picker.
  'practice.own': { ml: 'സ്വന്തം', en: 'Own', signoff: ['ml', 'en'] },
  'practice.changed': {
    ml: 'ഈ ടോപ്പിക് പുതുക്കിയിട്ടുണ്ട്. പുതിയ ചോദ്യങ്ങളുമായി വീണ്ടും തുടങ്ങുന്നു.',
    en: 'This topic was updated. Starting again with its new questions.',
    signoff: ['ml', 'en'],
  },
  'practice.deleted': { ml: 'ഈ ടോപ്പിക് ഡിലീറ്റ് ചെയ്തു', en: 'This topic was deleted', signoff: ['ml', 'en'] },
  'topics.mine': { ml: 'എന്റെ ടോപ്പിക്കുകൾ', en: 'My topics', signoff: ['ml', 'en'] },
  'topics.mine.row_one': {
    ml: '{{count, number}} ചോദ്യം · സ്വകാര്യം',
    en: '{{count, number}} question · private',
    signoff: ['ml', 'en'],
    params: { ml: { count: 1 }, en: { count: 1 } },
  },
  'topics.mine.row_other': {
    ml: '{{count, number}} ചോദ്യം · സ്വകാര്യം',
    en: '{{count, number}} questions · private',
    signoff: ['ml', 'en'],
    params: { ml: { count: 15 }, en: { count: 15 } },
  },
} as const satisfies Record<string, Entry>;

export type PracticeKey = keyof typeof practiceCatalogue;

for (const language of LANGUAGES) {
  const resources: Record<string, string> = {};
  for (const [key, entry] of Object.entries(practiceCatalogue) as [PracticeKey, Entry][]) {
    const value = entry[language];
    if (value !== null) resources[key] = value;
  }
  i18n.addResourceBundle(language, 'translation', resources, true, true);
}
