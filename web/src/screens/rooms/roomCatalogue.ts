import i18n from 'i18next';
import { LANGUAGES, type Entry } from '../../i18n/catalogue.ts';

/**
 * The Battle Room strings (Stories 5.2 and 5.3). They live with the rooms chunk, not in the main catalogue, so the entry chunk
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
  'rooms.join.sending': { ml: '…', en: '…', signoff: both },
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
  'rooms.lobby.joining': { ml: 'റൂമിൽ ചേരുന്നു…', en: 'Joining the room…', signoff: both },
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

  // Joining (Story 5.3). The bad-code, not-found, started, rate-limit and host-closed Malayalam is TBD (voice sign-off).
  'rooms.join.error.badCode': {
    ml: 'കോഡ് പരിശോധിക്കൂ. കോഡിൽ 6 അക്ഷരങ്ങളും അക്കങ്ങളും ഉണ്ട്, 0, O, 1, I, L ഒരിക്കലും ഇല്ല.',
    en: 'Check the code. Codes have 6 letters and numbers and never use 0, O, 1, I or L.',
    signoff: both,
  },
  'rooms.join.error.notFound': { ml: 'ഈ കോഡിൽ റൂം ഇല്ല. ഹോസ്റ്റിനോട് ചോദിച്ച് ഉറപ്പാക്കൂ.', en: 'No room has this code. Check it with the host.', signoff: both },
  'rooms.join.error.expired': {
    ml: '{{code}} കാലാവധി കഴിഞ്ഞു. പുതിയ കോഡ് പങ്കിടാൻ ഹോസ്റ്റിനോട് പറയൂ.',
    en: '{{code}} has expired. Ask the host to share a new code.',
    signoff: both,
    params: { ml: { code: 'K7M-Q2X' }, en: { code: 'K7M-Q2X' } },
  },
  'rooms.join.error.full': { ml: 'റൂം നിറഞ്ഞു (50). പുതിയ റൂമിനായി ഹോസ്റ്റിനോട് ചോദിക്കൂ.', en: 'Room is full (50). Ask the host for a new room.', signoff: both },
  'rooms.join.error.started': {
    ml: 'ഈ റൂം ഇതിനകം തുടങ്ങി. അടുത്ത റൂമിനായി ഹോസ്റ്റിനോട് ചോദിക്കൂ.',
    en: 'This room has already started. Ask the host for the next room.',
    signoff: both,
  },
  'rooms.join.error.rateLimited': { ml: 'ഒരുപാട് ശ്രമങ്ങൾ. ഒരു മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.', en: 'Too many tries. Wait a minute and try again.', signoff: both },
  'rooms.join.error.generic': { ml: 'റൂമിൽ ചേരാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.', en: "Couldn't join the room. Try again.", signoff: both },
  'rooms.join.error.profile': { ml: 'റൂമിൽ ചേരാൻ പ്രൊഫൈൽ പൂർത്തിയാക്കൂ.', en: 'Finish your profile to join a room.', signoff: both },

  // Player lobby and the joined chips
  'rooms.lobby.waitingFor': {
    ml: '{{host}} തുടങ്ങുന്നതും കാത്ത്',
    en: 'Waiting for {{host}} to start',
    signoff: both,
    params: { ml: { host: 'Rajeev' }, en: { host: 'Rajeev' } },
  },
  'rooms.chip.new': { ml: 'ഇപ്പോൾ', en: 'Just in', signoff: both },
  'rooms.chip.more': {
    ml: '+{{n, number}} പേർ',
    en: '+{{n, number}} more',
    signoff: both,
    params: { ml: { n: 26 }, en: { n: 26 } },
  },
  'rooms.announce.joined': {
    ml: '{{n, number}} പേർ ചേർന്നു, റൂമിൽ {{total, number}} പേർ',
    en: '{{n, number}} joined, {{total, number}} in room',
    signoff: both,
    params: { ml: { n: 3, total: 23 }, en: { n: 3, total: 23 } },
  },
  'rooms.announce.left': {
    ml: '{{n, number}} പേർ പോയി, റൂമിൽ {{total, number}} പേർ',
    en: '{{n, number}} left, {{total, number}} in room',
    signoff: both,
    params: { ml: { n: 1, total: 22 }, en: { n: 1, total: 22 } },
  },
  'rooms.announce.both': {
    ml: '{{joined, number}} പേർ ചേർന്നു, {{left, number}} പേർ പോയി, റൂമിൽ {{total, number}} പേർ',
    en: '{{joined, number}} joined, {{left, number}} left, {{total, number}} in room',
    signoff: both,
    params: { ml: { joined: 3, left: 1, total: 22 }, en: { joined: 3, left: 1, total: 22 } },
  },

  // Host: close confirm and start
  'rooms.close.title': { ml: 'റൂം അടയ്ക്കണോ? എല്ലാവരെയും തിരികെ അയയ്ക്കും.', en: 'Close the room? Everyone will be sent back.', signoff: both },
  'rooms.close.stay': { ml: 'തുടരാം', en: 'Stay', signoff: both },
  'rooms.close.confirm': { ml: 'റൂം അടയ്ക്കുക', en: 'Close room', signoff: both },
  'rooms.start.sending': { ml: 'തുടങ്ങുന്നു…', en: 'Starting…', signoff: both },
  'rooms.start.failed': { ml: 'തുടങ്ങാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.', en: "Couldn't start. Try again.", signoff: both },

  // Starting a match (Story 5.4). Every Malayalam line here awaits voice sign-off.
  'rooms.start.pending': { ml: '…', en: '…', signoff: both },
  'rooms.lobby.starting': { ml: 'തുടങ്ങുകയാണ്…', en: 'Starting…', signoff: both },
  'rooms.start.topicUnavailable': {
    ml: 'ഈ ടോപ്പിക്കിൽ ഇപ്പോൾ ആവശ്യത്തിന് ചോദ്യങ്ങൾ ഇല്ല. മറ്റൊന്ന് തിരഞ്ഞെടുക്കൂ.',
    en: 'That topic has too few questions right now. Pick another.',
    signoff: both,
  },
  'rooms.start.changeTopic': { ml: 'ടോപ്പിക് മാറ്റാം', en: 'Change topic', signoff: both },
  'rooms.start.draining': {
    ml: 'മിന്നൽ അപ്ഡേറ്റ് ചെയ്യുകയാണ്. അൽപ്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.',
    en: 'Minnal is updating. Try again in a moment.',
    signoff: both,
  },

  // The Battle Room live screen (Story 5.4): the countdown and the plain standings.
  'room.countdown.label': {
    ml: 'തുടങ്ങാൻ {{n, number}}',
    en: 'Starting in {{n, number}}',
    signoff: both,
    params: { ml: { n: 3 }, en: { n: 3 } },
  },
  'room.standings.heading': { ml: 'സ്കോർ നില', en: 'Standings', signoff: both },
  'room.standings.row': {
    ml: '{{rank, number}}-ാം സ്ഥാനം, {{name}}, {{score, number}} പോയിന്റ്, {{status}}',
    en: 'Place {{rank, number}}, {{name}}, {{score, number}} points, {{status}}',
    signoff: both,
    params: { ml: { rank: 1, name: 'Anju', score: 1200, status: 'ഉത്തരം നൽകി' }, en: { rank: 1, name: 'Anju', score: 1200, status: 'answered' } },
  },
  'room.standings.notAnswered': { ml: 'ഇതുവരെ ഉത്തരം നൽകിയില്ല', en: 'not answered yet', signoff: both },
  'room.final.row': {
    ml: '{{rank, number}}-ാം സ്ഥാനം, {{name}}, {{score, number}} പോയിന്റ്',
    en: 'Place {{rank, number}}, {{name}}, {{score, number}} points',
    signoff: both,
    params: { ml: { rank: 1, name: 'Anju', score: 1200 }, en: { rank: 1, name: 'Anju', score: 1200 } },
  },

  // Battle Room results (Story 5.5): the compact band, the podium and the full standings. Every line awaits sign-off.
  'room.result.title': { ml: 'ബാറ്റിൽ റൂം ഫലം', en: 'Battle Room results', signoff: both },
  'room.result.band': {
    ml: '{{total, number}} പേരിൽ #{{place, number}}',
    en: '#{{place, number}} of {{total, number}}',
    signoff: both,
    params: { ml: { place: 3, total: 23 }, en: { place: 3, total: 23 } },
  },
  'room.result.heading': {
    ml: '{{total, number}} പേരിൽ {{place, number}}-ാം സ്ഥാനം, {{score, number}} പോയിന്റ്',
    en: 'Place {{place, number}} of {{total, number}}, {{score, number}} points',
    signoff: both,
    params: { ml: { place: 3, total: 23, score: 3960 }, en: { place: 3, total: 23, score: 3960 } },
  },
  'room.podium.heading': { ml: 'പോഡിയം', en: 'Podium', signoff: both },
  'room.results.standings': { ml: 'എല്ലാവരുടെയും സ്കോർ നില', en: 'Full standings', signoff: both },
  'room.results.correct': {
    ml: '{{n, number}} ശരി',
    en: '{{n, number}} correct',
    signoff: both,
    params: { ml: { n: 7 }, en: { n: 7 } },
  },
  'room.results.row': {
    ml: '{{rank, number}}-ാം സ്ഥാനം, {{name}}, {{score, number}} പോയിന്റ്, {{correct, number}} ശരി{{status}}',
    en: 'Place {{rank, number}}, {{name}}, {{score, number}} points, {{correct, number}} correct{{status}}',
    signoff: both,
    params: {
      ml: { rank: 1, name: 'Anju', score: 1200, correct: 7, status: '' },
      en: { rank: 1, name: 'Anju', score: 1200, correct: 7, status: '' },
    },
  },

  // Play again (Story 5.6): the host's "New room" after the window, and a player's Join button. Awaiting sign-off.
  'room.playAgain.newRoom': { ml: 'പുതിയ റൂം', en: 'New room', signoff: both },
  'room.playAgain.join': {
    ml: '{{host}}-ന്റെ പുതിയ റൂമിൽ ചേരാം',
    en: "Join {{host}}'s new room",
    signoff: both,
    params: { ml: { host: 'Rajeev' }, en: { host: 'Rajeev' } },
  },
  'room.playAgain.announce': {
    ml: '{{host}} പുതിയ റൂം തുറന്നു. ചേരാം.',
    en: '{{host}} opened a new room. You can join.',
    signoff: both,
    params: { ml: { host: 'Rajeev' }, en: { host: 'Rajeev' } },
  },

  // Notices on the Rooms tab
  'rooms.notice.expired': { ml: 'ആ റൂമിന്റെ സമയം കഴിഞ്ഞു.', en: 'That room expired.', signoff: both },
  'rooms.notice.disconnected': { ml: 'കണക്ഷൻ പോയതിനാൽ റൂം അടച്ചു.', en: 'The room closed because you were disconnected.', signoff: both },
  'rooms.notice.draining': {
    ml: 'മിന്നൽ അപ്ഡേറ്റ് ചെയ്യുകയാണ്. റൂം അടച്ചു · അൽപ്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.',
    en: 'Minnal is updating, so the room closed. Try again in a moment.',
    signoff: both,
  },
  'rooms.notice.closed': { ml: 'റൂം അടച്ചു.', en: 'The room was closed.', signoff: both },
  'rooms.notice.hostClosed': {
    ml: '{{host}} റൂം അടച്ചു',
    en: '{{host}} closed the room',
    signoff: both,
    params: { ml: { host: 'Rajeev' }, en: { host: 'Rajeev' } },
  },
  'rooms.notice.lost': { ml: 'റൂമുമായുള്ള കണക്ഷൻ നഷ്ടമായി.', en: 'You lost the connection to the room.', signoff: both },
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
