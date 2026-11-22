import type { TopicDetail } from './manageApi.ts';

/** "11 Nov" in the UI language, as a day in India (IST): the date a topic was last updated. */
export function shortDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'ml' ? 'ml-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}

/** A topic's questions as the FR46 JSON the Import screen takes, so re-import starts from what is stored. */
export function topicToJson(topic: Pick<TopicDetail, 'name' | 'questions'>): string {
  return JSON.stringify(
    {
      topic: topic.name,
      questions: topic.questions.map((q) => ({ question: q.text, options: q.options, answer: q.answerIndex, explanation: q.explanation })),
    },
    null,
    2,
  );
}

/** The `lang` for a name or text from its script: Malayalam letters outnumber Latin letters, else English (UX-DR94). */
export function scriptLang(text: string): 'ml' | 'en' {
  let malayalam = 0;
  let latin = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0d00 && cp <= 0x0d7f && /\p{L}/u.test(ch)) malayalam++;
    else if (/\p{Script=Latin}/u.test(ch)) latin++;
  }
  return malayalam > latin ? 'ml' : 'en';
}
