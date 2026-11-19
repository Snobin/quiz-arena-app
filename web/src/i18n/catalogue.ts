/**
 * The bilingual string catalogue: the single typed source of every user-facing string.
 *
 * Copy comes from EXPERIENCE.md › Voice and Tone (`catalogue.test.ts` renders each `moment` entry
 * with its example params and fails on drift from the table) plus the shell strings.
 *
 * Values:
 * - a string: the copy, with i18next `{{param}}` interpolation. Numbers go through the
 *   `number` / `signed` formats (Latin digits, Indian grouping, see format.ts).
 * - `null`: TBD. The key is left out of that language's resources, so i18next falls back to the
 *   other language, and `pendingSignoff()` flags it.
 * - `''`: none by design (e.g. English has no peak slang). Renders as nothing.
 *
 * `signoff` lists the languages whose copy is an [ASSUMPTION] awaiting voice sign-off.
 * Plurals use i18next suffixes (`_one`, `_other`); call `t(base, { count })`.
 * Display names are always interpolated unchanged, never inflected into Malayalam grammar.
 */

import { LANGUAGES, type Language } from './language.ts';

export { LANGUAGES, type Language } from './language.ts';

type Params = Record<string, string | number>;

export type Entry = {
  ml: string | null;
  en: string | null;
  /** Languages whose copy is an [ASSUMPTION] that still needs voice sign-off. */
  signoff?: readonly Language[];
  /** The EXPERIENCE.md Voice and Tone row this entry transcribes. */
  moment?: string;
  /** Example params per language, used by the table test and as documentation. */
  params?: Partial<Record<Language, Params>>;
};

export const catalogue = {
  // Shell
  'brand.name': { ml: 'മിന്നൽ', en: 'Minnal' },
  'title.withBrand': {
    ml: '{{title}} · {{brand}}',
    en: '{{title}} · {{brand}}',
    params: { ml: { title: 'ചോദ്യം 4 / 10', brand: 'മിന്നൽ' }, en: { title: 'Question 4 / 10', brand: 'Minnal' } },
  },
  'title.home': { ml: 'ഹോം', en: 'Home', signoff: ['ml', 'en'] },
  'title.signIn': { ml: 'സൈൻ ഇൻ', en: 'Sign in', signoff: ['ml', 'en'] },
  'title.matchmaking': { ml: 'മാച്ച് തിരയൽ', en: 'Matchmaking', signoff: ['ml', 'en'] },
  'tab.play': { ml: 'കളി', en: 'Play' },
  'tab.rooms': { ml: 'റൂമുകൾ', en: 'Rooms' },
  'tab.ranks': { ml: 'റാങ്ക്', en: 'Ranks' },
  'tab.me': { ml: 'ഞാൻ', en: 'Me' },
  'nav.main': { ml: 'പ്രധാന മെനു', en: 'Main', signoff: ['ml', 'en'] },
  'common.loading': { ml: 'ലോഡ് ചെയ്യുന്നു…', en: 'Loading…', signoff: ['ml', 'en'] },
  'play.quickMatch': { ml: 'ക്വിക്ക് മാച്ച്', en: 'Quick Match', signoff: ['ml', 'en'] },
  'common.back': { ml: 'തിരികെ', en: 'Back', signoff: ['ml', 'en'] },
  'common.retry': { ml: 'വീണ്ടും ശ്രമിക്കൂ', en: 'Try again', signoff: ['ml', 'en'] },
  'common.cancel': { ml: 'റദ്ദാക്കുക', en: 'Cancel', signoff: ['ml', 'en'] },

  // Guest Home (key-home mockup, guest column)
  'home.guestHeader': { ml: 'അതിഥിയായി കളിക്കുന്നു', en: 'Playing as guest', signoff: ['ml', 'en'] },
  'home.quickMatch.subtitle': {
    ml: '10 ചോദ്യം · 15 സെ വീതം · ഏകദേശം 4 മിനിറ്റ്',
    en: '10 questions · 15 s each · about 4 min',
    signoff: ['ml', 'en'],
  },
  'home.quickMatch.play': { ml: 'കളിക്കാം →', en: 'Play now →', signoff: ['ml', 'en'] },
  'home.quickMatch.needsSession': {
    ml: 'അതിഥി സെഷൻ തയ്യാറാക്കുന്നു…',
    en: 'Setting up your guest session…',
    signoff: ['ml', 'en'],
  },
  'guest.error.network': {
    ml: 'മിന്നലിലേക്ക് എത്താനായില്ല. കണക്ഷൻ നോക്കി വീണ്ടും ശ്രമിക്കൂ.',
    en: "Couldn't reach Minnal. Check your connection and try again.",
    signoff: ['ml', 'en'],
  },
  'guest.error.server': {
    ml: 'അതിഥി സെഷൻ തുടങ്ങാനായില്ല. അൽപ്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.',
    en: "Minnal couldn't start your guest session. Try again in a moment.",
    signoff: ['ml', 'en'],
  },
  'mode.topicDuel.title': { ml: 'ടോപ്പിക് ഡ്യുവൽ', en: 'Topic Duel', signoff: ['ml', 'en'] },
  'mode.topicDuel.sub': { ml: 'വിഷയം തിരഞ്ഞെടുത്ത് 1v1', en: 'Pick a topic, 1v1', signoff: ['ml', 'en'] },
  'mode.solo.title': { ml: 'സോളോ പ്രാക്ടീസ്', en: 'Solo Practice', signoff: ['ml', 'en'] },
  'mode.solo.sub': { ml: 'ടൈമർ ഇല്ല · സ്വന്തം വേഗത്തിൽ', en: 'No timer, your own pace', signoff: ['ml', 'en'] },
  'mode.battleRoom.title': { ml: 'ബാറ്റിൽ റൂം', en: 'Battle Room', signoff: ['ml', 'en'] },
  'mode.battleRoom.sub': {
    ml: 'ബാച്ചിനൊപ്പം · കോഡ് ഉണ്ടോ? ചേരാം',
    en: 'Play with your batch by code',
    signoff: ['ml', 'en'],
  },
  'mode.locked.label': { ml: 'സൈൻ ഇൻ', en: 'Sign in', signoff: ['ml', 'en'] },
  'mode.locked.a11y': {
    ml: '{{mode}}, ലോക്ക് ചെയ്തിരിക്കുന്നു, കളിക്കാൻ സൈൻ ഇൻ ചെയ്യൂ',
    en: '{{mode}}, locked, sign in to play',
    signoff: ['ml', 'en'],
    params: { ml: { mode: 'ടോപ്പിക് ഡ്യുവൽ' }, en: { mode: 'Topic Duel' } },
  },
  'nudge.title': {
    ml: 'ബാക്കി മോഡുകൾ തുറക്കാൻ സൈൻ ഇൻ ചെയ്യൂ',
    en: 'Sign in to unlock the rest',
    signoff: ['ml', 'en'],
  },
  'nudge.body': {
    ml: 'ടോപ്പിക് ഡ്യുവൽ, സോളോ പ്രാക്ടീസ്, ബാറ്റിൽ റൂം എന്നിവയ്ക്ക് സൗജന്യ അക്കൗണ്ട് വേണം. റേറ്റിംഗ് 1200-ൽ തുടങ്ങും, കേരള ലീഡർബോർഡിലും ചേരാം.',
    en: 'Topic Duel, Solo Practice and Battle Room need a free account. Your ratings start at 1200 and you join the Kerala leaderboard.',
    signoff: ['ml', 'en'],
  },
  'signIn.title': { ml: 'മിന്നലിൽ സൈൻ ഇൻ ചെയ്യൂ', en: 'Sign in to Minnal', signoff: ['ml', 'en'] },
  'signIn.google': { ml: 'Google ഉപയോഗിച്ച് തുടരുക', en: 'Continue with Google', signoff: ['ml', 'en'] },
  'signIn.cancelled': { ml: 'സൈൻ ഇൻ റദ്ദാക്കി', en: 'Sign-in cancelled', signoff: ['ml', 'en'] },
  'signIn.failed': {
    ml: 'സൈൻ ഇൻ നടന്നില്ല. വീണ്ടും ശ്രമിക്കൂ.',
    en: "Sign-in didn't work. Please try again.",
    signoff: ['ml', 'en'],
  },
  'auth.signInAgain': { ml: 'വീണ്ടും സൈൻ ഇൻ ചെയ്യൂ', en: 'Please sign in again', signoff: ['ml', 'en'] },
  'auth.signingIn': { ml: 'സൈൻ ഇൻ ചെയ്യുന്നു…', en: 'Signing you in…', signoff: ['ml', 'en'] },
  'auth.signedInAs': {
    ml: 'സൈൻ ഇൻ ചെയ്തു: {{name}}',
    en: 'Signed in as {{name}}',
    signoff: ['ml', 'en'],
    params: { ml: { name: 'അഞ്ജു' }, en: { name: 'Anju' } },
  },
  'home.registeredHeaderNoName': { ml: 'ഹായ്', en: 'Hi', signoff: ['ml', 'en'] },
  'mode.comingSoon': { ml: 'ഉടൻ വരുന്നു', en: 'Coming soon', signoff: ['ml', 'en'] },
  'mode.comingSoon.a11y': {
    ml: '{{mode}}, ഉടൻ വരുന്നു',
    en: '{{mode}}, coming soon',
    signoff: ['ml', 'en'],
    params: { ml: { mode: 'ടോപ്പിക് ഡ്യുവൽ' }, en: { mode: 'Topic Duel' } },
  },
  // Profile (Story 2.3)
  'district.thiruvananthapuram': { ml: 'തിരുവനന്തപുരം', en: 'Thiruvananthapuram', signoff: ['ml', 'en'] },
  'district.kollam': { ml: 'കൊല്ലം', en: 'Kollam', signoff: ['ml', 'en'] },
  'district.pathanamthitta': { ml: 'പത്തനംതിട്ട', en: 'Pathanamthitta', signoff: ['ml', 'en'] },
  'district.alappuzha': { ml: 'ആലപ്പുഴ', en: 'Alappuzha', signoff: ['ml', 'en'] },
  'district.kottayam': { ml: 'കോട്ടയം', en: 'Kottayam', signoff: ['ml', 'en'] },
  'district.idukki': { ml: 'ഇടുക്കി', en: 'Idukki', signoff: ['ml', 'en'] },
  'district.ernakulam': { ml: 'എറണാകുളം', en: 'Ernakulam', signoff: ['ml', 'en'] },
  'district.thrissur': { ml: 'തൃശ്ശൂർ', en: 'Thrissur', signoff: ['ml', 'en'] },
  'district.palakkad': { ml: 'പാലക്കാട്', en: 'Palakkad', signoff: ['ml', 'en'] },
  'district.malappuram': { ml: 'മലപ്പുറം', en: 'Malappuram', signoff: ['ml', 'en'] },
  'district.kozhikode': { ml: 'കോഴിക്കോട്', en: 'Kozhikode', signoff: ['ml', 'en'] },
  'district.wayanad': { ml: 'വയനാട്', en: 'Wayanad', signoff: ['ml', 'en'] },
  'district.kannur': { ml: 'കണ്ണൂർ', en: 'Kannur', signoff: ['ml', 'en'] },
  'district.kasaragod': { ml: 'കാസർകോട്', en: 'Kasaragod', signoff: ['ml', 'en'] },
  'district.outside-kerala': { ml: 'കേരളത്തിന് പുറത്ത്', en: 'Outside Kerala', signoff: ['ml', 'en'] },
  'profile.level.TENTH': { ml: 'പത്താം ക്ലാസ്', en: '10th', signoff: ['ml', 'en'] },
  'profile.level.DEGREE': { ml: 'ഡിഗ്രി', en: 'Degree', signoff: ['ml', 'en'] },
  'profile.level.OTHER': { ml: 'മറ്റുള്ളവ', en: 'Other', signoff: ['ml', 'en'] },
  'profile.language.ml': { ml: 'മലയാളം', en: 'മലയാളം', signoff: ['ml', 'en'] },
  'profile.language.en': { ml: 'English', en: 'English', signoff: ['ml', 'en'] },
  'profile.setup.title': { ml: 'പ്രൊഫൈൽ സജ്ജമാക്കാം', en: 'Set up your profile', signoff: ['ml', 'en'] },
  'profile.section': { ml: 'പ്രൊഫൈൽ', en: 'Profile', signoff: ['ml', 'en'] },
  'profile.field.name': { ml: 'പേര്', en: 'Display name', signoff: ['ml', 'en'] },
  'profile.field.district': { ml: 'ജില്ല', en: 'District', signoff: ['ml', 'en'] },
  'profile.field.level': { ml: 'പരീക്ഷാ തലം', en: 'Exam level', signoff: ['ml', 'en'] },
  'profile.field.language': { ml: 'ഭാഷ', en: 'Language', signoff: ['ml', 'en'] },
  'profile.choose': { ml: 'തിരഞ്ഞെടുക്കൂ', en: 'Choose', signoff: ['ml', 'en'] },
  'profile.save': { ml: 'സേവ് ചെയ്യുക', en: 'Save', signoff: ['ml', 'en'] },
  'profile.saving': { ml: 'സേവ് ചെയ്യുന്നു…', en: 'Saving…', signoff: ['ml', 'en'] },
  'profile.edit': { ml: 'എഡിറ്റ്', en: 'Edit', signoff: ['ml', 'en'] },
  'profile.languageChanged': { ml: 'ഭാഷ മലയാളം', en: 'Language: English', signoff: ['ml', 'en'] },
  'profile.error.length': { ml: '2–24 അക്ഷരങ്ങൾ ഉപയോഗിക്കൂ', en: 'Use 2–24 letters', signoff: ['ml', 'en'] },
  'profile.error.chars': { ml: "അക്ഷരങ്ങൾ, അക്കങ്ങൾ, സ്പേസ്, . ' - എന്നിവ മാത്രം", en: "Only letters, numbers, spaces and . ' - are allowed", signoff: ['ml', 'en'] },
  'profile.error.start': { ml: 'ഒരു അക്ഷരത്തിൽ തുടങ്ങൂ', en: 'Start with a letter', signoff: ['ml', 'en'] },
  'profile.error.punctuation': { ml: 'രണ്ട് ചിഹ്നങ്ങൾ തുടർച്ചയായി വേണ്ട', en: "Don't use two punctuation marks in a row", signoff: ['ml', 'en'] },
  'profile.error.reserved': { ml: 'മറ്റൊരു പേര് തിരഞ്ഞെടുക്കൂ', en: 'Choose a different name', signoff: ['ml', 'en'] },
  'profile.error.district': { ml: 'ജില്ല തിരഞ്ഞെടുക്കൂ', en: 'Choose your district', signoff: ['ml', 'en'] },
  'profile.error.examLevel': { ml: 'പരീക്ഷാ തലം തിരഞ്ഞെടുക്കൂ', en: 'Choose your exam level', signoff: ['ml', 'en'] },
  'profile.error.language': { ml: 'ഭാഷ തിരഞ്ഞെടുക്കൂ', en: 'Choose a language', signoff: ['ml', 'en'] },
  'profile.error.save': { ml: 'സേവ് ചെയ്യാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.', en: "Couldn't save. Please try again.", signoff: ['ml', 'en'] },
  'profile.error.load': { ml: 'പ്രൊഫൈൽ ലോഡ് ചെയ്യാനായില്ല.', en: "Couldn't load your profile.", signoff: ['ml', 'en'] },
  'home.quickMatch.needsProfile': { ml: 'കളിക്കാൻ പ്രൊഫൈൽ പൂർത്തിയാക്കൂ', en: 'Finish your profile to play', signoff: ['ml', 'en'] },
  'home.registeredHello': { ml: 'ഹായ്,', en: 'Hi,', signoff: ['ml', 'en'] },
  'me.signedOutLine': { ml: 'റേറ്റിംഗും പ്രൊഫൈലും കാണാൻ സൈൻ ഇൻ ചെയ്യൂ', en: 'Sign in to see your profile and ratings', signoff: ['ml', 'en'] },
  // Matchmaking and the live-match stub (Story 1.6)
  'title.match': { ml: 'മാച്ച്', en: 'Match', signoff: ['ml', 'en'] },
  'common.home': { ml: 'ഹോം', en: 'Home', signoff: ['ml', 'en'] },
  'badge.bot': { ml: 'BOT', en: 'BOT', signoff: ['ml', 'en'] },
  'matchmaking.elapsed': {
    ml: '{{seconds, number}} സെക്കൻഡ്',
    en: '{{seconds, number}} s',
    signoff: ['ml', 'en'],
    params: { ml: { seconds: 5 }, en: { seconds: 5 } },
  },
  'matchmaking.failed': {
    ml: 'മാച്ച് തുടങ്ങാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.',
    en: "Couldn't start the match. Try again.",
    signoff: ['ml', 'en'],
  },
  'matchmaking.connectionFailed': {
    ml: 'മിന്നലിലേക്ക് കണക്റ്റ് ചെയ്യാനായില്ല. കണക്ഷൻ നോക്കി വീണ്ടും ശ്രമിക്കൂ.',
    en: "Couldn't connect to Minnal. Check your connection and try again.",
    signoff: ['ml', 'en'],
  },
  'matchmaking.draining': {
    ml: 'മിന്നൽ അപ്ഡേറ്റ് ചെയ്യുകയാണ്. അൽപ്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.',
    en: 'Minnal is updating. Try again in a moment.',
    signoff: ['ml', 'en'],
  },
  'matchmaking.alreadyInMatch': {
    ml: 'നിങ്ങൾ ഇപ്പോൾ ഒരു മാച്ചിലാണ്.',
    en: "You're already in a match.",
    signoff: ['ml', 'en'],
  },
  'matchmaking.alreadySearching': {
    ml: 'മറ്റൊരു ടാബിലോ ഫോണിലോ നിങ്ങൾ ഇതിനകം എതിരാളിയെ തിരയുന്നുണ്ട്.',
    en: "You're already searching on another tab or device.",
    signoff: ['ml', 'en'],
  },
  'matchmaking.returnToMatch': { ml: 'മാച്ചിലേക്ക് മടങ്ങാം', en: 'Back to your match', signoff: ['ml', 'en'] },
  'match.foundVs': { ml: 'മാച്ച് റെഡി · എതിരാളി', en: 'Match found · vs', signoff: ['ml', 'en'] },
  'match.none': { ml: 'ഈ സ്ക്രീനിൽ മാച്ച് ഒന്നുമില്ല.', en: "There's no match on this screen.", signoff: ['ml', 'en'] },
  // Live match screen (Story 1.8). Agent-drafted in both languages: every entry awaits sign-off.
  'title.question': {
    ml: 'ചോദ്യം {{n, number}} / {{total, number}}',
    en: 'Question {{n, number}} / {{total, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { n: 4, total: 10 }, en: { n: 4, total: 10 } },
  },
  'match.progress': {
    ml: 'ചോദ്യം {{n, number}} / {{total, number}}',
    en: 'Q {{n, number}}/{{total, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { n: 4, total: 10 }, en: { n: 4, total: 10 } },
  },
  'match.questionPosition': {
    ml: 'ചോദ്യം {{n, number}} / {{total, number}}, {{seconds, number}} സെക്കൻഡ്',
    en: 'Question {{n, number}} of {{total, number}}, {{seconds, number}} seconds',
    signoff: ['ml', 'en'],
    params: { ml: { n: 4, total: 10, seconds: 15 }, en: { n: 4, total: 10, seconds: 15 } },
  },
  'match.seconds_one': {
    ml: '{{count, number}} സെക്കൻഡ്',
    en: '{{count, number}} second',
    signoff: ['ml', 'en'],
    params: { ml: { count: 1 }, en: { count: 1 } },
  },
  'match.seconds_other': {
    ml: '{{count, number}} സെക്കൻഡ്',
    en: '{{count, number}} seconds',
    signoff: ['ml', 'en'],
    params: { ml: { count: 9 }, en: { count: 9 } },
  },
  'match.secondsShort': {
    ml: '{{seconds, number}} സെ',
    en: '{{seconds, number}} s',
    signoff: ['ml', 'en'],
    params: { ml: { seconds: 9 }, en: { seconds: 9 } },
  },
  'match.fiveSeconds': { ml: '5 സെക്കൻഡ് ബാക്കി', en: '5 seconds left', signoff: ['ml', 'en'] },
  'match.getReady': { ml: 'തയ്യാറാകൂ…', en: 'Get ready…', signoff: ['ml', 'en'] },
  'match.you': { ml: 'നിങ്ങൾ', en: 'You', signoff: ['ml', 'en'] },
  'match.thinking': { ml: 'ആലോചിക്കുന്നു…', en: 'thinking…', signoff: ['ml', 'en'] },
  'match.answered': { ml: 'ഉത്തരം നൽകി', en: 'answered', signoff: ['ml', 'en'] },
  'match.opponentAnswered': {
    ml: '{{name}} · ഉത്തരം നൽകി',
    en: '{{name}} answered',
    signoff: ['ml', 'en'],
    params: { ml: { name: 'Vishnu R' }, en: { name: 'Vishnu R' } },
  },
  'match.showEnglish': { ml: 'ഇംഗ്ലീഷിൽ കാണിക്കുക', en: 'Show in English', signoff: ['ml', 'en'] },
  'match.showMalayalam': { ml: 'മലയാളത്തിൽ കാണിക്കുക', en: 'Show in Malayalam', signoff: ['ml', 'en'] },
  'match.tagEn': { ml: 'EN', en: 'EN', signoff: ['ml', 'en'] },
  'match.tagMl': { ml: 'മല', en: 'മല', signoff: ['ml', 'en'] },
  'match.lockTag': { ml: 'ലോക്ക്', en: 'Locked', signoff: ['ml', 'en'] },
  'match.sending': { ml: 'അയയ്ക്കുന്നു', en: 'Sending', signoff: ['ml', 'en'] },
  'match.lockedFooter': {
    ml: 'ഉത്തരം ലോക്ക് ചെയ്തു · സമയം തീരുമ്പോൾ ഫലം',
    en: 'Locked in · result when time runs out',
    signoff: ['ml', 'en'],
  },
  // Story 1.11: 1v1, her own result is in and the question is still open for the opponent.
  // The name is never inflected: name + separator in Malayalam.
  'match.waitingFor': {
    ml: '{{name}} · കാത്തിരിക്കുന്നു…',
    en: 'Waiting for {{name}}…',
    signoff: ['ml', 'en'],
    params: { ml: { name: 'Vishnu R' }, en: { name: 'Vishnu R' } },
  },
  'match.bandCorrect': {
    ml: 'ചോദ്യം {{n, number}} · ശരി',
    en: 'Question {{n, number}} · Correct',
    signoff: ['ml', 'en'],
    params: { ml: { n: 4 }, en: { n: 4 } },
  },
  'match.correctAnswer': { ml: 'ശരിയുത്തരം', en: 'Correct answer', signoff: ['ml', 'en'] },
  'match.totalShort': {
    ml: 'ആകെ {{total, number}}',
    en: 'total {{total, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { total: 3140 }, en: { total: 3140 } },
  },
  'match.revealCorrect': {
    ml: 'ശരി. ഉത്തരം: {{answer}}. {{points, signed}}, ആകെ {{total, number}}',
    en: 'Correct. Answer: {{answer}}. {{points, signed}}, total {{total, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { answer: 'പെരിയാർ', points: 800, total: 3140 }, en: { answer: 'Periyar', points: 800, total: 3140 } },
  },
  'match.revealWrong': {
    ml: 'തെറ്റി. ഉത്തരം: {{answer}}. ആകെ {{total, number}}',
    en: 'Wrong. Answer: {{answer}}. Total {{total, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { answer: 'പെരിയാർ', total: 2340 }, en: { answer: 'Periyar', total: 2340 } },
  },
  'match.explanation': { ml: 'വിശദീകരണം', en: 'Explanation', signoff: ['ml', 'en'] },
  'match.sourceNotAvailable': { ml: 'ഉറവിടം ലഭ്യമല്ല', en: 'source not available', signoff: ['ml', 'en'] },
  'match.over': {
    ml: 'മാച്ച് കഴിഞ്ഞു · {{total, number}}',
    en: 'Match over · {{total, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { total: 3140 }, en: { total: 3140 } },
  },
  // Story 1.9: reconnect, forfeit and leave. Drafted in both languages; every entry awaits native
  // review. Names are never inflected: name + separator in Malayalam.
  'match.leave': { ml: 'പുറത്തുപോകുക', en: 'Leave', signoff: ['ml', 'en'] },
  'match.stay': { ml: 'തുടരാം', en: 'Stay', signoff: ['ml', 'en'] },
  'match.opponentLeft': {
    ml: '{{name}} · മാച്ചിൽ നിന്ന് പോയി',
    en: '{{name}} left the match',
    signoff: ['ml', 'en'],
    params: { ml: { name: 'Vishnu R' }, en: { name: 'Vishnu R' } },
  },
  'match.opponentLeftWin': {
    moment: 'Opponent left (1v1)',
    ml: '{{name}} പോയി · നിങ്ങൾ ജയിച്ചു',
    en: '{{name}} left · you win',
    signoff: ['ml'],
    params: { ml: { name: '{name}' }, en: { name: '{name}' } },
  },
  'match.leftStatus': { ml: 'പോയി', en: 'left', signoff: ['ml', 'en'] },
  'match.aborted': {
    ml: 'മാച്ച് പൂർത്തിയായില്ല, ഇത് കണക്കാക്കില്ല',
    en: "The match was called off and won't count",
    signoff: ['ml', 'en'],
  },
  'match.reconnected': { ml: 'തിരിച്ചെത്തി, മാച്ച് തുടരുന്നു', en: "You're back in the match", signoff: ['ml', 'en'] },
  // Rejoin after a reload: "Reconnecting…" with no countdown (match.reconnecting has one). Drafted; awaits review.
  'match.rejoining': { ml: 'തിരിച്ചു വരുന്നു…', en: 'Reconnecting…', signoff: ['ml', 'en'] },
  'results.title': { ml: 'ഫലം', en: 'Results', signoff: ['ml', 'en'] },
  // Story 1.10: the results screen. Drafted in both languages; every entry awaits native review.
  'result.winTitle': { ml: 'ജയിച്ചു!', en: 'You won!', signoff: ['ml', 'en'] },
  'results.continue': { ml: 'തുടരുക', en: 'Continue', signoff: ['ml', 'en'] },
  'results.heading.win': {
    ml: 'നിങ്ങൾ ജയിച്ചു, {{you, number}} – {{them, number}}',
    en: 'You won, {{you, number}} to {{them, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { you: 3140, them: 2980 }, en: { you: 3140, them: 2980 } },
  },
  'results.heading.loss': {
    ml: 'ഇത്തവണ നഷ്ടമായി, {{you, number}} – {{them, number}}',
    en: 'You lost, {{you, number}} to {{them, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { you: 2980, them: 3140 }, en: { you: 2980, them: 3140 } },
  },
  'results.heading.draw': {
    ml: 'സമനില, {{you, number}} – {{them, number}}',
    en: 'Draw, {{you, number}} to {{them, number}}',
    signoff: ['ml', 'en'],
    params: { ml: { you: 3140, them: 3140 }, en: { you: 3140, them: 3140 } },
  },
  'results.dots': { ml: 'ഓരോ ചോദ്യവും', en: 'Question by question', signoff: ['ml', 'en'] },
  'results.dot.correct': {
    ml: 'Q{{n, number}} ശരി',
    en: 'Q{{n, number}} correct',
    signoff: ['ml', 'en'],
    params: { ml: { n: 3 }, en: { n: 3 } },
  },
  'results.dot.wrong': {
    ml: 'Q{{n, number}} തെറ്റ്',
    en: 'Q{{n, number}} wrong',
    signoff: ['ml', 'en'],
    params: { ml: { n: 3 }, en: { n: 3 } },
  },
  'results.dot.missed': {
    ml: 'Q{{n, number}} ഉത്തരമില്ല',
    en: 'Q{{n, number}} not answered',
    signoff: ['ml', 'en'],
    params: { ml: { n: 3 }, en: { n: 3 } },
  },
  'results.questionShort': { ml: 'Q{{n, number}}', en: 'Q{{n, number}}', signoff: ['ml', 'en'], params: { ml: { n: 3 }, en: { n: 3 } } },
  // `seconds` comes preformatted with exactly one decimal (formatTenths): "4.0", "9.2".
  'results.seconds': {
    ml: '{{seconds}} സെ',
    en: '{{seconds}} s',
    signoff: ['ml', 'en'],
    params: { ml: { seconds: '9.2' }, en: { seconds: '9.2' } },
  },
  'results.yours': { ml: 'നിങ്ങൾ:', en: 'You:', signoff: ['ml', 'en'] },
  'results.answer': { ml: 'ശരി:', en: 'Answer:', signoff: ['ml', 'en'] },
  'results.notAnswered': { ml: 'ഉത്തരം നൽകിയില്ല', en: 'not answered', signoff: ['ml', 'en'] },
  'results.pending': {
    ml: 'മാച്ച് ഇനിയും തുടരുന്നു; അവസാനിക്കുമ്പോൾ മുഴുവൻ ഫലം ഇവിടെ കാണാം',
    en: 'The match is still going; the full results will show here when it ends',
    signoff: ['ml', 'en'],
  },
  // Story 1.10 part 2: rematch. Drafted in both languages; every entry awaits native review.
  'rematch.request': { ml: 'റീമാച്ച്', en: 'Rematch', signoff: ['ml', 'en'] },
  'rematch.accept': { ml: 'റീമാച്ച് സ്വീകരിക്കുക', en: 'Accept rematch', signoff: ['ml', 'en'] },
  'rematch.secondsLeft': {
    ml: '{{seconds, number}} സെക്കൻഡ് ബാക്കി',
    en: '{{seconds, number}} s left',
    signoff: ['ml', 'en'],
    params: { ml: { seconds: 42 }, en: { seconds: 42 } },
  },
  'rematch.note.expired': {
    ml: 'റീമാച്ച് അഭ്യർത്ഥനയുടെ സമയം കഴിഞ്ഞു',
    en: 'The rematch request ran out of time',
    signoff: ['ml', 'en'],
  },
  'rematch.note.cancelled': {
    ml: '{{name}} · റീമാച്ച് റദ്ദാക്കി',
    en: '{{name}} cancelled the rematch',
    signoff: ['ml', 'en'],
    params: { ml: { name: 'Vishnu R' }, en: { name: 'Vishnu R' } },
  },
  'rematch.note.unavailable': {
    ml: 'ഇപ്പോൾ റീമാച്ച് സാധ്യമല്ല',
    en: "A rematch isn't possible right now",
    signoff: ['ml', 'en'],
  },
  'rematch.note.failed': {
    ml: 'റീമാച്ച് തുടങ്ങാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.',
    en: "Couldn't start the rematch. Try again.",
    signoff: ['ml', 'en'],
  },
  'rematch.note.draining': {
    ml: 'മിന്നൽ അപ്ഡേറ്റ് ചെയ്യുകയാണ്. അൽപ്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.',
    en: 'Minnal is updating. Try again in a moment.',
    signoff: ['ml', 'en'],
  },
  'rooms.placeholder': {
    ml: 'റൂമുകൾ ഉടൻ വരുന്നു. ബാച്ചിനെ മുഴുവൻ ഒരുമിച്ച് കളിപ്പിക്കാം.',
    en: 'Rooms are coming soon. Your whole batch will play together here.',
    signoff: ['ml', 'en'],
  },
  'ranks.placeholder': {
    ml: 'റാങ്ക് ലിസ്റ്റ് ഉടൻ വരുന്നു. അതുവരെ കുറച്ചു കളികൾ ജയിച്ചു വെക്കൂ.',
    en: 'Leaderboards are on the way. Win a few matches in the meantime.',
    signoff: ['ml', 'en'],
  },
  'me.placeholder': {
    ml: 'നിങ്ങളുടെ പ്രൊഫൈലും സെറ്റിങ്സും ഉടൻ ഇവിടെ എത്തും.',
    en: 'Your profile and settings will land here soon.',
    signoff: ['ml', 'en'],
  },
  'offline.banner': {
    ml: 'ഇന്റർനെറ്റ് ഇല്ല. കണക്ഷൻ തിരിച്ചു വന്നാൽ കളിക്കാം.',
    en: "You're offline. You can play again once you're back online.",
    signoff: ['ml', 'en'],
  },
  'offline.playCaption': {
    ml: 'കളിക്കാൻ ഇന്റർനെറ്റ് കണക്ഷൻ വേണം',
    en: 'Playing needs an internet connection',
    signoff: ['ml', 'en'],
  },

  // Voice and Tone (EXPERIENCE.md)
  'matchmaking.searching': { moment: 'Matchmaking', ml: 'എതിരാളിയെ തിരയുന്നു…', en: 'Finding an opponent…' },
  'matchmaking.botJoined': { moment: 'Bot joins', ml: 'മിന്നൽ ബോട്ട് ചേർന്നു', en: 'Minnal Bot joined' },
  'match.firstTapHint': {
    moment: 'First-tap hint',
    ml: 'ഒന്നു തൊട്ടാൽ ഉത്തരം ലോക്ക് ആകും',
    en: 'One tap locks your answer',
    signoff: ['en'],
  },
  'match.locked': { moment: 'Locked', ml: 'ഉത്തരം ലോക്ക് ചെയ്തു', en: 'Locked in' },
  'match.wrong': {
    moment: 'Wrong',
    ml: 'ശരി: {{answer}}. അടുത്തതിൽ നോക്കാം!',
    en: "It's {{answer}}. Get the next one!",
    params: { ml: { answer: 'പെരിയാർ' }, en: { answer: 'Periyar' } },
  },
  'match.overtake': {
    moment: 'Overtake',
    ml: '▲ {{name}} · മറികടന്നു',
    en: '▲ You passed {{name}}',
    params: { ml: { name: 'Arjun K' }, en: { name: 'Arjun' } },
  },
  'result.win': {
    moment: 'Win',
    ml: 'ജയിച്ചു! {{delta, signed}}',
    en: 'You won! {{delta, signed}}',
    params: { ml: { delta: 24 }, en: { delta: 24 } },
  },
  'result.winSlang': { moment: 'Win (peak slang)', ml: 'പൊളി!', en: '' },
  'result.lossBand': {
    moment: 'Loss band',
    ml: '{{name}} ജയിച്ചു · അടുത്ത തവണ നിങ്ങൾക്ക്',
    en: "{{name}} won · Next time's yours",
    signoff: ['en'],
    params: { ml: { name: 'Vishnu' }, en: { name: 'Vishnu' } },
  },
  'result.draw': { moment: 'Draw', ml: 'സമനില', en: 'Draw' },
  'match.reconnecting': {
    moment: 'Reconnect',
    ml: 'കണക്ഷൻ പോയി, തിരിച്ചു വരുന്നു… {{seconds, number}}',
    en: 'Reconnecting… {{seconds, number}}',
    params: { ml: { seconds: 8 }, en: { seconds: 8 } },
  },
  'match.forfeited': {
    moment: 'Forfeited (Battle Room)',
    ml: 'ബാക്കി ചോദ്യങ്ങൾ നഷ്ടമായി, മാച്ച് തുടരുന്നു',
    en: 'You missed the remaining questions; the match goes on',
    signoff: ['en'],
  },
  'match.forfeitedOneVsOne': {
    moment: 'Forfeited (1v1)',
    ml: 'നിങ്ങൾ പോയി · {{name}} ജയിച്ചു',
    en: 'You left · {{name}} wins',
    signoff: ['ml'],
    params: { ml: { name: '{name}' }, en: { name: '{name}' } },
  },
  'match.leaveConfirm': {
    moment: 'Leave confirm',
    ml: 'പുറത്തുപോകണോ? ബാക്കി ചോദ്യങ്ങൾ നഷ്ടമാകും',
    en: "Leave? You'll forfeit the remaining questions",
    signoff: ['ml'],
  },
  'report.link': { moment: 'Report link', ml: 'തെറ്റുണ്ടോ?', en: 'Something wrong?', signoff: ['en'] },
  'rematch.waiting': {
    moment: 'Rematch waiting',
    ml: '{{name}} · കാത്തിരിക്കുന്നു…',
    en: 'Waiting for {{name}}…',
    signoff: ['ml'],
    params: { ml: { name: 'Vishnu R' }, en: { name: 'Vishnu R' } },
  },
  'share.cta': { moment: 'Share CTA', ml: null, en: 'Beat me on Minnal', signoff: ['ml'] },
  'lobby.waitingForMore_one': {
    moment: 'Lobby < 2 humans',
    ml: null,
    en: 'Waiting for {{count, number}} more player',
    params: { en: { count: 1 } },
  },
  'lobby.waitingForMore_other': {
    ml: null,
    en: 'Waiting for {{count, number}} more players',
    params: { en: { count: 3 } },
  },
  'leaderboard.empty': {
    moment: 'Leaderboard empty',
    ml: null,
    en: "No one's on today's board yet. The first win today takes the top spot.",
    signoff: ['ml', 'en'],
  },
  'import.errorOptionCount': {
    moment: 'Import error',
    ml: 'ചോദ്യം {{question, number}}: {{required, number}} ഓപ്ഷനുകൾ വേണം, {{found, number}} എണ്ണമേ ഉള്ളൂ',
    en: 'Question {{question, number}} needs {{required, number}} options; it has {{found, number}}',
    params: { ml: { question: 7, required: 4, found: 3 }, en: { question: 7, required: 4, found: 3 } },
  },
  'join.expired': {
    moment: 'Join: expired',
    ml: null,
    en: '{{code}} has expired. Ask the host to share a new code.',
    params: { en: { code: 'K7M-Q2X' } },
  },
  'join.full': {
    moment: 'Join: full',
    ml: null,
    en: 'Room is full ({{max, number}}). Ask the host for a new room.',
    params: { en: { max: 50 } },
  },
} as const satisfies Record<string, Entry>;

/** Every catalogue key, plural suffixes included. */
export type CatalogueKey = keyof typeof catalogue;

/** The keys to pass to `t()`: plural suffixes collapse to their base key. */
export type MessageKey = CatalogueKey extends infer K
  ? K extends `${infer Base}_${'one' | 'other'}`
    ? Base
    : K
  : never;

/** One language's i18next resources: TBD (`null`) entries are omitted so the fallback applies. */
export function resourcesFor(language: Language): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(catalogue) as [CatalogueKey, Entry][]) {
    const value = entry[language];
    if (value !== null) out[key] = value;
  }
  return out;
}

export type PendingSignoff = { key: CatalogueKey; language: Language; reason: 'tbd' | 'assumption' };

/** Every string still waiting on copy: TBD (`null`) values and [ASSUMPTION] languages. */
export function pendingSignoff(): PendingSignoff[] {
  const pending: PendingSignoff[] = [];
  for (const [key, entry] of Object.entries(catalogue) as [CatalogueKey, Entry][]) {
    for (const language of LANGUAGES) {
      if (entry[language] === null) pending.push({ key, language, reason: 'tbd' });
      else if (entry.signoff?.includes(language)) pending.push({ key, language, reason: 'assumption' });
    }
  }
  return pending;
}

// Typed t(): only catalogue keys compile (plural bases resolve through their _one/_other keys).
declare module 'i18next' {
  interface CustomTypeOptions {
    keySeparator: false;
    nsSeparator: false;
    resources: { translation: Record<CatalogueKey, string> };
  }
}
