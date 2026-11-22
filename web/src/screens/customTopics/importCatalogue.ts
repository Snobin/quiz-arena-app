import i18n from 'i18next';
import { LANGUAGES, type Entry } from '../../i18n/catalogue.ts';

/**
 * The custom-topic import strings (Story 6.2). They live with the import chunk, not in the main catalogue, so the entry chunk does
 * not carry them: importing this module registers them with i18next, and `t()` stays typed through `ImportKey`. Same entry shape
 * and rules as `catalogue.ts`. Every Malayalam line is an [ASSUMPTION] awaiting voice sign-off; the Malayalam GPT prompt is TBD
 * (the English prompt is shown in both languages). Field names (`options`, `answer`) and topic names are inserted unchanged.
 */
const both = ['ml', 'en'] as const;

export const importCatalogue = {
  'import.title': { ml: 'ഇംപോർട്ട്', en: 'Import', signoff: both },
  'import.name.label': { ml: 'ടോപ്പിക്ക് പേര്', en: 'Topic name', signoff: both },
  'import.paste.label': { ml: 'ചോദ്യങ്ങൾ JSON', en: 'Questions JSON', signoff: both },
  'import.tally': { ml: '{{found}} ചോദ്യം കണ്ടെത്തി · ശേഷം {{used}} / {{cap}}', en: '{{found}} found · {{used}} / {{cap}} after import', signoff: both },
  'import.tally.found': { ml: '{{found}} ചോദ്യം കണ്ടെത്തി', en: '{{found}} found', signoff: both },
  'import.tally.empty': { ml: 'മുകളിൽ ചോദ്യങ്ങൾ പേസ്റ്റ് ചെയ്യൂ', en: 'Paste your questions above', signoff: both },
  'import.headroom.questions': { ml: 'ഇതിനു ശേഷം {{left}} ചോദ്യങ്ങൾക്കു കൂടി ഇടമുണ്ട്', en: 'After this you\'ll have {{left}} questions left', signoff: both },
  'import.headroom.topics': { ml: 'ഇതിനു ശേഷം {{left}} ടോപ്പിക്കുകൾക്കു കൂടി ഇടമുണ്ട്', en: 'After this you\'ll have {{left}} topics left', signoff: both },
  'import.over.questions': { ml: '{{cap}} ചോദ്യ പരിധിയെക്കാൾ {{over}} കൂടുതൽ. {{over}} ചോദ്യം കുറയ്ക്കൂ, അല്ലെങ്കിൽ പഴയ ടോപ്പിക്ക് ഡിലീറ്റ് ചെയ്യൂ.', en: 'Over the {{cap}}-question limit by {{over}}. Remove {{over}} questions or delete an old topic.', signoff: both },
  'import.over.topics': { ml: 'നിങ്ങൾക്ക് {{cap}} ടോപ്പിക്കിൽ {{topics}} ഉണ്ട്. പുതിയത് ഇംപോർട്ട് ചെയ്യാൻ ഒന്ന് ഡിലീറ്റ് ചെയ്യൂ.', en: 'You have {{topics}} of {{cap}} topics. Delete one to import a new topic.', signoff: both },
  'import.button_one': { ml: 'ഇംപോർട്ട് · {{count}} ചോദ്യം', en: 'Import · {{count}} question', signoff: both },
  'import.button_other': { ml: 'ഇംപോർട്ട് · {{count}} ചോദ്യം', en: 'Import · {{count}} questions', signoff: both },
  'import.button.sending': { ml: '…', en: '…', signoff: both },
  'import.reason.fix_one': { ml: '{{count}} തെറ്റ് തിരുത്തിയാൽ ഇംപോർട്ട് ചെയ്യാം', en: 'Fix {{count}} problem to import', signoff: both },
  'import.reason.fix_other': { ml: '{{count}} തെറ്റുകൾ തിരുത്തിയാൽ ഇംപോർട്ട് ചെയ്യാം', en: 'Fix {{count}} problems to import', signoff: both },
  'import.reason.name': { ml: 'ടോപ്പിക്ക് പേര് ചേർക്കൂ', en: 'Add a topic name', signoff: both },
  'import.reason.paste': { ml: 'ആദ്യം ചോദ്യങ്ങൾ പേസ്റ്റ് ചെയ്യൂ', en: 'Paste your questions first', signoff: both },
  'import.reason.offline': { ml: 'ഓഫ്‌ലൈൻ ആണ്. ഇംപോർട്ട് ചെയ്യാൻ കണക്ട് ചെയ്യൂ.', en: 'You are offline. Connect to import.', signoff: both },
  'import.reason.over.questions': { ml: '{{cap}} ചോദ്യ പരിധി കഴിഞ്ഞു', en: 'Over the {{cap}}-question limit', signoff: both },
  'import.reason.over.topics': { ml: 'ടോപ്പിക്ക് പരിധി എത്തി', en: 'Topic limit reached', signoff: both },
  'import.errors.heading_one': { ml: '{{count}} തെറ്റ് തിരുത്തിയാൽ ഇംപോർട്ട് ചെയ്യാം', en: 'Fix {{count}} problem to import', signoff: both },
  'import.errors.heading_other': { ml: '{{count}} തെറ്റുകൾ തിരുത്തിയാൽ ഇംപോർട്ട് ചെയ്യാം', en: 'Fix {{count}} problems to import', signoff: both },
  'import.errors.hint': { ml: 'ഒരു തെറ്റിൽ തൊട്ടാൽ അതിന്റെ വരിയിലേക്ക് പോകാം.', en: 'Tap a problem to jump to its line.', signoff: both },
  'import.errors.more': { ml: '{{count}} തെറ്റുകളിൽ ആദ്യത്തെ {{shown}} എണ്ണം, ഫീൽഡ് അനുസരിച്ച്.', en: 'Showing the first {{shown}} of {{count}}, grouped by field.', signoff: both },
  'import.errors.download': { ml: 'എല്ലാ തെറ്റുകളും ഡൗൺലോഡ് ചെയ്യൂ (CSV)', en: 'Download all problems (CSV)', signoff: both },
  'import.row.a11y.item': { ml: 'ചോദ്യം {{item}}, {{field}}, വരി {{line}}', en: 'Question {{item}}, {{field}}, line {{line}}', signoff: both },
  'import.row.a11y.line': { ml: '{{field}}, വരി {{line}}', en: '{{field}}, line {{line}}', signoff: both },
  'import.row.prefix': { ml: 'ചോദ്യം {{item}}', en: 'Question {{item}}', signoff: both },
  'import.row.a11y.bare': { ml: '{{field}}', en: '{{field}}', signoff: both },
  'import.err.json.empty': { ml: 'ചോദ്യങ്ങളുടെ JSON പേസ്റ്റ് ചെയ്യൂ.', en: 'Paste the questions JSON.', signoff: both },
  'import.err.json.notObject': { ml: 'JSON { കൊണ്ട് തുടങ്ങി "questions" ലിസ്റ്റ് വേണം.', en: 'The JSON must start with { and have a "questions" list.', signoff: both },
  'import.err.json.extra': { ml: 'JSON തീർന്ന ശേഷം അധിക ടെക്സ്റ്റ് ഉണ്ട് (വരി {{line}}, കോളം {{column}}).', en: 'There is extra text after the JSON ends (line {{line}}, column {{column}}).', signoff: both },
  'import.err.json.comma': { ml: 'വരി {{line}}, കോളം {{column}}-ന് മുമ്പ് കോമയോ ക്ലോസിങ് ബ്രാക്കറ്റോ ഇല്ല', en: 'Missing comma or closing bracket before line {{line}}, column {{column}}', signoff: both },
  'import.err.json.end': { ml: 'JSON നേരത്തേ അവസാനിച്ചു (വരി {{line}}, കോളം {{column}})', en: 'The JSON ends too early (line {{line}}, column {{column}})', signoff: both },
  'import.err.json.duplicate': { ml: 'ഒരേ ഒബ്ജക്റ്റിൽ ഒരു കീ രണ്ടുതവണ വന്നു (വരി {{line}}, കോളം {{column}})', en: 'A key appears twice in the same object (line {{line}}, column {{column}})', signoff: both },
  'import.err.json.generic': { ml: 'വരി {{line}}, കോളം {{column}} അടുത്ത് JSON ശരിയല്ല', en: 'Not valid JSON near line {{line}}, column {{column}}', signoff: both },
  'import.err.questions.missing': { ml: '"questions" ലിസ്റ്റ് ഇല്ല.', en: 'There is no "questions" list.', signoff: both },
  'import.err.questions.notList': { ml: '"questions" ഒരു ലിസ്റ്റ് ആയിരിക്കണം.', en: '"questions" must be a list.', signoff: both },
  'import.err.questions.empty': { ml: '"questions" ലിസ്റ്റ് ശൂന്യമാണ്.', en: 'The "questions" list is empty.', signoff: both },
  'import.err.topic.notText': { ml: '"topic" ടെക്സ്റ്റ് ആയിരിക്കണം.', en: '"topic" must be text.', signoff: both },
  'import.err.item.notObject': { ml: 'ചോദ്യം {{item}} ഒരു ഒബ്ജക്റ്റ് ആയിരിക്കണം.', en: 'Question {{item}} must be an object.', signoff: both },
  'import.err.question.type': { ml: 'ചോദ്യം {{item}}: ചോദ്യം ടെക്സ്റ്റ് ആയിരിക്കണം.', en: 'Question {{item}}: the question must be text.', signoff: both },
  'import.err.options.type': { ml: 'ചോദ്യം {{item}}: ഓപ്ഷനുകൾ 4 ടെക്സ്റ്റുകളുടെ ലിസ്റ്റ് ആയിരിക്കണം.', en: 'Question {{item}}: options must be a list of 4 texts.', signoff: both },
  'import.err.option.type': { ml: 'ചോദ്യം {{item}}: ഓപ്ഷൻ {{n}} ടെക്സ്റ്റ് ആയിരിക്കണം.', en: 'Question {{item}}: option {{n}} must be text.', signoff: both },
  'import.err.answer.type': { ml: 'ചോദ്യം {{item}}: ഉത്തരം 0 മുതൽ 3 വരെയുള്ള പൂർണ്ണസംഖ്യ ആയിരിക്കണം.', en: 'Question {{item}}: answer must be a whole number 0 to 3.', signoff: both },
  'import.err.explanation.type': { ml: 'ചോദ്യം {{item}}: വിശദീകരണം ടെക്സ്റ്റ് ആയിരിക്കണം.', en: 'Question {{item}}: the explanation must be text.', signoff: both },
  'import.err.question.required': { ml: 'ചോദ്യം {{item}}-ന് ചോദ്യ ടെക്സ്റ്റ് ഇല്ല.', en: 'Question {{item}} has no question text.', signoff: both },
  'import.err.question.tooLong': { ml: 'ചോദ്യം {{item}}: ടെക്സ്റ്റ് {{count}} അക്ഷരം; പരിധി {{max}}.', en: 'Question {{item}}: the text is {{count}} characters; the limit is {{max}}.', signoff: both },
  'import.err.options.count': { ml: 'ചോദ്യം {{item}}: 4 ഓപ്ഷനുകൾ വേണം, {{got}} എണ്ണമേ ഉള്ളൂ', en: 'Question {{item}} needs 4 options; it has {{got}}', signoff: both },
  'import.err.options.blank': { ml: 'ചോദ്യം {{item}}: ഓപ്ഷൻ {{n}} ശൂന്യമാണ്.', en: 'Question {{item}}: option {{n}} is empty.', signoff: both },
  'import.err.options.duplicate': { ml: 'ചോദ്യം {{item}}: രണ്ട് ഓപ്ഷനുകൾ ഒന്നുതന്നെയാണ്.', en: 'Question {{item}}: two options are the same.', signoff: both },
  'import.err.option.tooLong': { ml: 'ചോദ്യം {{item}}: ഓപ്ഷൻ {{n}} {{count}} അക്ഷരം; പരിധി {{max}}.', en: 'Question {{item}}: option {{n}} is {{count}} characters; the limit is {{max}}.', signoff: both },
  'import.err.answer.required': { ml: 'ചോദ്യം {{item}}-ന് ഉത്തരം ഇല്ല.', en: 'Question {{item}} has no answer.', signoff: both },
  'import.err.answer.range': { ml: 'ചോദ്യം {{item}}: ഉത്തരം {{got}} 0 മുതൽ 3 വരെയല്ല.', en: 'Question {{item}}: answer {{got}} is not 0 to 3.', signoff: both },
  'import.err.explanation.required': { ml: 'ചോദ്യം {{item}}-ന് വിശദീകരണം ഇല്ല.', en: 'Question {{item}} has no explanation.', signoff: both },
  'import.err.explanation.tooLong': { ml: 'ചോദ്യം {{item}}: വിശദീകരണം {{count}} അക്ഷരം; പരിധി {{max}}.', en: 'Question {{item}}: the explanation is {{count}} characters; the limit is {{max}}.', signoff: both },
  'import.fix.shorten': { ml: '{{over}} അക്ഷരം കുറയ്ക്കൂ.', en: 'Shorten it by {{over}} characters.', signoff: both },
  'import.fix.extra': { ml: 'അവസാനത്തെ } ന് ശേഷമുള്ളത് മായ്ക്കൂ.', en: 'Remove everything after the final }.', signoff: both },
  'import.fix.comma': { ml: 'മുൻ വരിയുടെ അവസാനം നോക്കൂ: ഇനങ്ങൾക്കിടയിൽ കോമ ഇടൂ, അല്ലെങ്കിൽ ] അല്ലെങ്കിൽ } കൊണ്ട് അടയ്ക്കൂ.', en: 'Check the end of the previous line: add a comma between items, or close it with ] or }.', signoff: both },
  'import.fix.end': { ml: '] അല്ലെങ്കിൽ } വിട്ടുപോയി. ഓരോ [ ഉം { ഉം അടച്ചിട്ടുണ്ടെന്ന് ഉറപ്പാക്കൂ.', en: 'A closing ] or } is missing. Make sure every [ and { is closed.', signoff: both },
  'import.fix.duplicate': { ml: 'ആവർത്തിച്ച കീ ഒഴിവാക്കൂ.', en: 'Remove the repeated key.', signoff: both },
  'import.fix.generic': { ml: 'വിട്ടുപോയ ഉദ്ധരണി, അധിക കോമ, അല്ലെങ്കിൽ JSON-ന് പുറത്തുള്ള ടെക്സ്റ്റ് നോക്കൂ.', en: 'Check for a missing quote, an extra comma, or text outside the JSON.', signoff: both },
  'import.fix.questions': { ml: 'കുറഞ്ഞത് 1 ചോദ്യമുള്ള "questions": [ ... ] ചേർക്കൂ.', en: 'Add "questions": [ ... ] with at least 1 question.', signoff: both },
  'import.fix.topic': { ml: 'ടോപ്പിക്ക് പേര് ഉദ്ധരണിയിൽ എഴുതൂ, അല്ലെങ്കിൽ "topic" കീ ഒഴിവാക്കൂ.', en: 'Write the topic name in quotes, or remove the "topic" key.', signoff: both },
  'import.fix.item': { ml: 'ഓരോ ചോദ്യവും { "question": ..., "options": [...], "answer": 0, "explanation": ... } ആയി എഴുതൂ.', en: 'Write each question as { "question": ..., "options": [...], "answer": 0, "explanation": ... }.', signoff: both },
  'import.fix.text': { ml: 'ഉദ്ധരണിയിൽ ടെക്സ്റ്റ് ആയി എഴുതൂ.', en: 'Write it as text in quotes.', signoff: both },
  'import.fix.options': { ml: 'കൃത്യം 4 വ്യത്യസ്ത ഓപ്ഷനുകൾ നൽകൂ.', en: 'Give exactly 4 different options.', signoff: both },
  'import.fix.answer': { ml: 'ആദ്യ ഓപ്ഷന് 0 മുതൽ നാലാമത്തേതിന് 3 വരെ ഉപയോഗിക്കൂ.', en: 'Use 0 for the first option up to 3 for the fourth.', signoff: both },
  'import.fix.explanation': { ml: 'ഉത്തരം ശരിയായതെന്തുകൊണ്ടെന്ന് ചെറിയ വിശദീകരണം ചേർക്കൂ.', en: 'Add a short explanation of why the answer is right.', signoff: both },
  'import.note.tooLarge': { ml: 'പേസ്റ്റ് വളരെ വലുതാണ് (1 MB-ൽ കൂടുതൽ). ചെറിയ ടോപ്പിക്കുകളായി വിഭജിക്കൂ.', en: 'Paste is too large (over 1 MB). Split it into smaller topics.', signoff: both },
  'import.note.rateLimited': { ml: 'വളരെയധികം ഇംപോർട്ടുകൾ. {{seconds}} സെക്കൻഡ് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.', en: 'Too many imports. Try again in {{seconds}} seconds.', signoff: both },
  'import.note.unavailable': { ml: 'ഇത് താൽക്കാലികമായി ലഭ്യമല്ല. ഒരു മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കൂ.', en: 'This is temporarily unavailable. Try again in a minute.', signoff: both },
  'import.note.network': { ml: 'മിന്നലുമായി ബന്ധപ്പെടാനായില്ല. കണക്ഷൻ നോക്കി വീണ്ടും ശ്രമിക്കൂ.', en: 'Could not reach Minnal. Check your connection and try again.', signoff: both },
  'import.note.server': { ml: 'എന്തോ കുഴപ്പം പറ്റി. ഒന്നും ഇംപോർട്ട് ചെയ്തിട്ടില്ല. വീണ്ടും ശ്രമിക്കൂ.', en: 'Something went wrong. Nothing was imported. Try again.', signoff: both },
  'import.format.title': { ml: 'JSON ഘടന', en: 'JSON format', signoff: both },
  'import.prompt.title': { ml: 'മാതൃകാ GPT പ്രോംപ്റ്റ്', en: 'Sample GPT prompt', signoff: both },
  'import.copy': { ml: 'കോപ്പി', en: 'Copy', signoff: both },
  'import.copied': { ml: 'കോപ്പി ചെയ്തു', en: 'Copied', signoff: both },
  'import.rule.1': { ml: 'കുറഞ്ഞത് 1 ചോദ്യം.', en: 'At least 1 question.', signoff: both },
  'import.rule.2': { ml: 'ഓരോ ചോദ്യത്തിനും കൃത്യം 4 ഓപ്ഷനുകൾ.', en: 'Exactly 4 options per question.', signoff: both },
  'import.rule.3': { ml: '"answer": 0 = ആദ്യത്തെ ഓപ്ഷൻ, 1 = രണ്ടാമത്തേത്, 2 = മൂന്നാമത്തേത്, 3 = നാലാമത്തേത്.', en: '"answer": 0 = first option, 1 = second, 2 = third, 3 = fourth.', signoff: both },
  'import.rule.4': { ml: 'ഓരോ ചോദ്യത്തിനും വിശദീകരണം വേണം.', en: 'An explanation is required for every question.', signoff: both },
  'import.rule.5': { ml: 'ചോദ്യം 1,000 അക്ഷരം വരെ, ഓരോ ഓപ്ഷനും 300 വരെ, വിശദീകരണം 2,000 വരെ.', en: 'Question up to 1,000 characters, each option up to 300, explanation up to 2,000.', signoff: both },
  'import.rule.6': { ml: 'ചോദ്യങ്ങൾ നിങ്ങൾ എഴുതുന്ന ഭാഷയിൽത്തന്നെ നിൽക്കും.', en: 'Questions stay in the language you write them in.', signoff: both },
  'import.prompt.note': { ml: 'ഉപയോഗിക്കും മുമ്പ് എല്ലാ ഉത്തരങ്ങളും പരിശോധിക്കൂ. AI-ക്ക് തെറ്റുപറ്റാം.', en: 'Check every answer before you use it. AI makes mistakes.', signoff: both },
  'import.success.title_one': { ml: '{{topic}} · {{count}} ചോദ്യം ഇംപോർട്ട് ചെയ്തു', en: '{{topic}} · {{count}} question imported', signoff: both },
  'import.success.title_other': { ml: '{{topic}} · {{count}} ചോദ്യം ഇംപോർട്ട് ചെയ്തു', en: '{{topic}} · {{count}} questions imported', signoff: both },
  'import.success.sub': { ml: 'നിങ്ങൾക്കു മാത്രം · റേറ്റിംഗ് ഇല്ല', en: 'Private to you · never rated', signoff: both },
  'import.success.battle': { ml: 'ബാറ്റിൽ റൂമിൽ ഉപയോഗിക്കാം', en: 'Use in Battle Room', signoff: both },
  'import.success.practice': { ml: 'പ്രാക്ടീസ്', en: 'Practice', signoff: both },
  'import.success.soon': { ml: 'പ്രാക്ടീസും ബാറ്റിൽ റൂമും ഉടൻ വരുന്നു', en: 'Practice and Battle Room arrive soon', signoff: both },
  'import.another': { ml: 'മറ്റൊന്ന് ഇംപോർട്ട് ചെയ്യാം', en: 'Import another', signoff: both },
  'import.leave.title': { ml: 'ഇംപോർട്ട് ചെയ്യാതെ പോകണോ? ഈ ടാബ് അടയ്ക്കുംവരെ പേസ്റ്റ് ചെയ്ത ടെക്സ്റ്റ് ഇവിടെയുണ്ടാകും.', en: 'Leave without importing? Your pasted text stays until you close this tab.', signoff: both },
  'import.leave.stay': { ml: 'ഇവിടെ നിൽക്കാം', en: 'Stay', signoff: both },
  'import.leave.leave': { ml: 'പോകാം', en: 'Leave', signoff: both },
  'import.announce.found_one': { ml: '{{count}} ചോദ്യം കണ്ടെത്തി', en: '{{count}} question found', signoff: both },
  'import.announce.found_other': { ml: '{{count}} ചോദ്യം കണ്ടെത്തി', en: '{{count}} questions found', signoff: both },
  'import.announce.problems_one': { ml: '{{count}} തെറ്റ് തിരുത്താനുണ്ട്', en: '{{count}} problem to fix', signoff: both },
  'import.announce.problems_other': { ml: '{{count}} തെറ്റുകൾ തിരുത്താനുണ്ട്', en: '{{count}} problems to fix', signoff: both },
} as const satisfies Record<string, Entry>;

export type ImportKey = keyof typeof importCatalogue;

for (const language of LANGUAGES) {
  const resources: Record<string, string> = {};
  for (const [key, entry] of Object.entries(importCatalogue) as [ImportKey, Entry][]) {
    const value = entry[language];
    if (value !== null) resources[key] = value;
  }
  i18n.addResourceBundle(language, 'translation', resources, true, true);
}
