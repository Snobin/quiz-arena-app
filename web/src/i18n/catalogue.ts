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
  'shell.tagline': { ml: 'സ്കാഫോൾഡ് പ്രവർത്തിക്കുന്നു', en: 'Scaffold is running' },
  'shell.probe.pending': { ml: '…', en: '…' },
  'shell.probe.unreachable': { ml: 'API ലഭ്യമല്ല', en: 'API unreachable', signoff: ['ml'] },
  'tab.play': { ml: 'കളി', en: 'Play' },
  'tab.rooms': { ml: 'റൂമുകൾ', en: 'Rooms' },
  'tab.ranks': { ml: 'റാങ്ക്', en: 'Ranks' },
  'tab.me': { ml: 'ഞാൻ', en: 'Me' },

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
    moment: 'Forfeited',
    ml: 'ബാക്കി ചോദ്യങ്ങൾ നഷ്ടമായി, മാച്ച് തുടരുന്നു',
    en: 'You missed the remaining questions; the match goes on',
    signoff: ['en'],
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
