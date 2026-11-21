import i18n from 'i18next';
import { LANGUAGES, type Entry } from '../../i18n/catalogue.ts';

/**
 * The Battle Room strings (Story 5.2). They live with the rooms chunk, not in the main catalogue, so the entry chunk
 * does not carry them: importing this module registers them with i18next, and `t()` stays typed through `RoomKey`.
 * Same entry shape and rules as `catalogue.ts`. Every Malayalam line here is an [ASSUMPTION] awaiting voice sign-off
 * (the share text most of all); display names and topic names are always inserted unchanged.
 */
const both = ['ml', 'en'] as const;

export const roomCatalogue = {
  // Rooms tab
  'rooms.create': { ml: 'റൂം ഉണ്ടാക്കാം', en: 'Create room', signoff: both },
  'rooms.join.heading': { ml: 'കോഡ് ഉപയോഗിച്ച് ചേരാം', en: 'Join with code', signoff: both },
  'rooms.join.label': { ml: 'റൂം കോഡ്', en: 'Room code', signoff: both },
  'rooms.join.button': { ml: 'ചേരാം', en: 'Join', signoff: both },
  'rooms.join.soon': { ml: 'ചേരൽ ഉടൻ വരുന്നു', en: 'Joining arrives soon', signoff: both },
  'rooms.recent.heading': { ml: 'അടുത്തിടെ ഹോസ്റ്റ് ചെയ്തത്', en: 'Recently hosted', signoff: both },
  'rooms.recent.sub': {
    ml: '{{questions}} · {{date}}',
    en: '{{questions}} · {{date}}',
    signoff: both,
    params: { ml: { questions: '10 ചോദ്യം', date: '11 നവം.' }, en: { questions: '10 questions', date: '11 Nov' } },
  },
  'rooms.active': {
    ml: 'നിങ്ങളുടെ റൂം തുറന്നിരിക്കുന്നു · {{code}}',
    en: 'Your room is open · {{code}}',
    signoff: both,
    params: { ml: { code: 'K7M-Q2X' }, en: { code: 'K7M-Q2X' } },
  },
  'rooms.guest.line': {
    ml: 'ബാറ്റിൽ റൂമിൽ ബാച്ചിലെ എല്ലാവരും ഒരേ ചോദ്യങ്ങൾ ഒരുമിച്ച് കളിക്കുന്നു. കോഡ് പങ്കിട്ട് തുടങ്ങാം.',
    en: 'In a Battle Room your whole batch plays the same questions together. Share a code and start.',
    signoff: both,
  },
  'rooms.offline': { ml: 'റൂമിന് ഇന്റർനെറ്റ് കണക്ഷൻ വേണം', en: 'Rooms need an internet connection', signoff: both },

  // Create screen
  'rooms.source.label': { ml: 'ടോപ്പിക്', en: 'Topic', signoff: both },
  'rooms.source.choose': { ml: 'ടോപ്പിക് തിരഞ്ഞെടുക്കുക', en: 'Choose a topic', signoff: both },
  'rooms.source.change': { ml: 'മാറ്റാം', en: 'Change', signoff: both },
  'rooms.source.chooseFirst': { ml: 'ആദ്യം ടോപ്പിക് തിരഞ്ഞെടുക്കൂ', en: 'Choose a topic first', signoff: both },
  'rooms.source.generic': { ml: 'PSC ടോപ്പിക്', en: 'PSC topic', signoff: both },
  'rooms.source.loading': { ml: 'ടോപ്പിക്കുകൾ ലോഡ് ചെയ്യുന്നു…', en: 'Loading topics…', signoff: both },
  'rooms.source.loadFailed': { ml: 'ടോപ്പിക്കുകൾ ലോഡ് ചെയ്യാനായില്ല.', en: "Couldn't load topics.", signoff: both },
  'rooms.create.submit': { ml: 'റൂം ഉണ്ടാക്കുക', en: 'Create room', signoff: both },
  'rooms.create.sending': { ml: 'ഉണ്ടാക്കുന്നു…', en: 'Creating…', signoff: both },
  'rooms.create.back': { ml: 'റൂമുകളിലേക്ക് തിരികെ', en: 'Back to Rooms', signoff: both },

  // Count stepper
  'rooms.count.label': { ml: 'ചോദ്യങ്ങൾ', en: 'Questions', signoff: both },
  'rooms.count.less': { ml: 'ചോദ്യങ്ങൾ കുറയ്ക്കുക', en: 'Fewer questions', signoff: both },
  'rooms.count.more': { ml: 'ചോദ്യങ്ങൾ കൂട്ടുക', en: 'More questions', signoff: both },
  'rooms.count.min_one': { ml: 'കുറഞ്ഞത് {{count, number}} ചോദ്യം', en: 'At least {{count, number}} question', signoff: both, params: { ml: { count: 1 }, en: { count: 1 } } },
  'rooms.count.min_other': { ml: 'കുറഞ്ഞത് {{count, number}} ചോദ്യം', en: 'At least {{count, number}} questions', signoff: both, params: { ml: { count: 5 }, en: { count: 5 } } },
  'rooms.count.max_one': { ml: 'പരമാവധി {{count, number}} ചോദ്യം', en: 'At most {{count, number}} question', signoff: both, params: { ml: { count: 1 }, en: { count: 1 } } },
  'rooms.count.max_other': { ml: 'പരമാവധി {{count, number}} ചോദ്യം', en: 'At most {{count, number}} questions', signoff: both, params: { ml: { count: 30 }, en: { count: 30 } } },
  'rooms.count.topic': {
    ml: 'ഈ ടോപ്പിക്കിൽ {{count, number}} ചോദ്യം ഉണ്ട്',
    en: 'This topic has {{count, number}} questions',
    signoff: both,
    params: { ml: { count: 18 }, en: { count: 18 } },
  },
  'rooms.count.lowered': {
    ml: 'ഈ ടോപ്പിക്കിൽ {{count, number}} ചോദ്യം മാത്രം · എണ്ണം {{count, number}} ആക്കി',
    en: 'This topic has {{count, number}} questions, so the count is now {{count, number}}',
    signoff: both,
    params: { ml: { count: 18 }, en: { count: 18 } },
  },
  'rooms.count.save': { ml: 'സേവ് ചെയ്യുക', en: 'Save', signoff: both },
  'rooms.count.saving': { ml: 'സേവ് ചെയ്യുന്നു…', en: 'Saving…', signoff: both },

  // Errors, shown inline
  'rooms.error.generic': { ml: 'റൂം ഉണ്ടാക്കാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.', en: "Couldn't create the room. Try again.", signoff: both },
  'rooms.error.connection': {
    ml: 'കണക്ട് ചെയ്യാനായില്ല. കണക്ഷൻ പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കൂ.',
    en: "Couldn't connect. Check your connection and try again.",
    signoff: both,
  },
  'rooms.error.config': { ml: 'ആ മാറ്റം സേവ് ചെയ്യാനായില്ല.', en: "Couldn't save that change.", signoff: both },
  'rooms.error.draining': {
    ml: 'മിന്നൽ അപ്ഡേറ്റ് ചെയ്യുകയാണ്. അൽപ്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.',
    en: 'Minnal is updating. Try again in a moment.',
    signoff: both,
  },
  'rooms.error.profile': { ml: 'റൂം ഉണ്ടാക്കാൻ പ്രൊഫൈൽ പൂർത്തിയാക്കൂ.', en: 'Finish your profile to create a room.', signoff: both },
  'rooms.error.profileLink': { ml: 'പ്രൊഫൈൽ പൂർത്തിയാക്കാം', en: 'Finish profile', signoff: both },
  'rooms.error.busy': { ml: 'നിങ്ങൾ ഇപ്പോൾ ഒരു മാച്ചിലോ റൂമിലോ ആണ്.', en: "You're already in a match or a room.", signoff: both },
  'rooms.error.busyReturn': { ml: 'തിരികെ പോകാം', en: 'Go back to it', signoff: both },
  'rooms.error.forbidden': { ml: 'റൂമുകൾ സൈൻ ഇൻ ചെയ്തവർക്ക് മാത്രം.', en: 'Rooms are for signed-in players.', signoff: both },

  // Host lobby
  'rooms.lobby.title': {
    ml: 'ബാറ്റിൽ റൂം · {{code}}',
    en: 'Battle Room · {{code}}',
    signoff: both,
    params: { ml: { code: 'K7M-Q2X' }, en: { code: 'K7M-Q2X' } },
  },
  'rooms.lobby.heading': { ml: 'ബാറ്റിൽ റൂം', en: 'Battle Room', signoff: both },
  'rooms.joinLink.soon': { ml: 'ലിങ്ക് വഴി റൂമിൽ ചേരുന്നത് ഉടൻ വരുന്നു.', en: 'Joining a room from a link arrives soon.', signoff: both },
  'rooms.lobby.leave': { ml: 'പുറത്തുകടക്കുക', en: 'Leave', signoff: both },
  'rooms.lobby.host': { ml: 'ഹോസ്റ്റ്', en: 'Host', signoff: both },
  'rooms.lobby.connecting': { ml: 'റൂമിലേക്ക് കണക്ട് ചെയ്യുന്നു…', en: 'Connecting to your room…', signoff: both },
  'rooms.lobby.reconnecting': { ml: 'വീണ്ടും കണക്ട് ചെയ്യുന്നു…', en: 'Reconnecting…', signoff: both },
  'rooms.code.label': { ml: 'റൂം കോഡ്', en: 'Room code', signoff: both },
  'rooms.code.a11y': {
    ml: 'റൂം കോഡ്: {{spelled}}',
    en: 'Room code: {{spelled}}',
    signoff: both,
    params: { ml: { spelled: 'K 7 M, Q 2 X' }, en: { spelled: 'K 7 M, Q 2 X' } },
  },
  'rooms.expires.today': {
    ml: '{{time}}-ന് കാലാവധി തീരും',
    en: 'expires {{time}}',
    signoff: both,
    params: { ml: { time: '7:30 pm' }, en: { time: '7:30 pm' } },
  },
  'rooms.expires.tomorrow': {
    ml: 'നാളെ {{time}}-ന് കാലാവധി തീരും',
    en: 'expires tomorrow {{time}}',
    signoff: both,
    params: { ml: { time: '7:30 pm' }, en: { time: '7:30 pm' } },
  },
  'rooms.share': { ml: 'WhatsApp-ൽ പങ്കിടാം', en: 'Share to WhatsApp', signoff: both },
  'rooms.share.title': { ml: 'മിന്നൽ ബാറ്റിൽ റൂം', en: 'Minnal Battle Room', signoff: both },
  'rooms.share.text': {
    ml: 'എന്റെ മിന്നൽ ബാറ്റിൽ റൂമിൽ ചേരൂ · {{code}}',
    en: 'Join my Minnal Battle Room · {{code}}',
    signoff: both,
    params: { ml: { code: 'K7M-Q2X' }, en: { code: 'K7M-Q2X' } },
  },
  'rooms.copyCode': { ml: 'കോഡ് കോപ്പി ചെയ്യുക', en: 'Copy code', signoff: both },
  'rooms.copied': { ml: 'കോപ്പി ചെയ്തു', en: 'Copied', signoff: both },
  'rooms.copyFailed': {
    ml: 'കോപ്പി ചെയ്യാനായില്ല. കോഡ് തിരഞ്ഞെടുത്തിട്ടുണ്ട്, കൈകൊണ്ട് കോപ്പി ചെയ്യാം.',
    en: "Couldn't copy. The code is selected so you can copy it yourself.",
    signoff: both,
  },
  'rooms.shareFailed': { ml: 'പങ്കിടാനായില്ല.', en: "Couldn't share.", signoff: both },
  'rooms.config.label': { ml: 'റൂം ക്രമീകരണം', en: 'Room settings', signoff: both },
  'rooms.edit': { ml: 'മാറ്റാം', en: 'Edit', signoff: both },
  'rooms.edit.source': { ml: 'ടോപ്പിക് മാറ്റാം', en: 'Edit topic', signoff: both },
  'rooms.edit.count': { ml: 'ചോദ്യങ്ങളുടെ എണ്ണം മാറ്റാം', en: 'Edit question count', signoff: both },
  'rooms.joined.count': {
    ml: '{{n, number}} പേർ ചേർന്നു',
    en: '{{n, number}} joined',
    signoff: both,
    params: { ml: { n: 1 }, en: { n: 1 } },
  },
  'rooms.you': { ml: 'നിങ്ങൾ', en: 'You', signoff: both },
  'rooms.start.label_one': { ml: 'തുടങ്ങാം · {{count, number}} പേർ', en: 'Start · {{count, number}} player', signoff: both, params: { ml: { count: 1 }, en: { count: 1 } } },
  'rooms.start.label_other': { ml: 'തുടങ്ങാം · {{count, number}} പേർ', en: 'Start · {{count, number}} players', signoff: both, params: { ml: { count: 2 }, en: { count: 2 } } },
  'rooms.start.waiting': { ml: 'ഒരാൾ കൂടി വേണം', en: 'Waiting for 1 more player', signoff: both },
  'rooms.start.leaveCloses': { ml: 'പുറത്തുകടന്നാൽ റൂം അടയ്ക്കും', en: 'Leaving closes the room', signoff: both },

  // Notices on the Rooms tab
  'rooms.notice.expired': { ml: 'ആ റൂമിന്റെ സമയം കഴിഞ്ഞു.', en: 'That room expired.', signoff: both },
  'rooms.notice.disconnected': { ml: 'കണക്ഷൻ പോയതിനാൽ റൂം അടച്ചു.', en: 'The room closed because you were disconnected.', signoff: both },
  'rooms.notice.draining': {
    ml: 'മിന്നൽ അപ്ഡേറ്റ് ചെയ്യുകയാണ്. റൂം അടച്ചു · അൽപ്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.',
    en: 'Minnal is updating, so the room closed. Try again in a moment.',
    signoff: both,
  },
  'rooms.notice.closed': { ml: 'റൂം അടച്ചു.', en: 'The room was closed.', signoff: both },
} as const satisfies Record<string, Entry>;

export type RoomKey = keyof typeof roomCatalogue;

for (const language of LANGUAGES) {
  const resources: Record<string, string> = {};
  for (const [key, entry] of Object.entries(roomCatalogue) as [RoomKey, Entry][]) {
    const value = entry[language];
    if (value !== null) resources[key] = value;
  }
  i18n.addResourceBundle(language, 'translation', resources, true, true);
}
