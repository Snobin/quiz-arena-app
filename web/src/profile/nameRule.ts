/**
 * The display-name rule (FR6), mirrored from core's `NameRule` (core is authoritative; the two share
 * the same test vectors). NFC, trim, collapse whitespace, then: 2-24 grapheme clusters, only Latin
 * letters, Malayalam (U+0D00-U+0D7F), ZWJ/ZWNJ, digits, space and . ' -, a leading letter, no two
 * punctuation marks in a row, and not a reserved name.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 24;

export type NameErrorCode = 'length' | 'chars' | 'start' | 'punctuation' | 'reserved';
export type NameResult = { ok: true; name: string } | { ok: false; code: NameErrorCode };

export function normaliseName(raw: string | null | undefined): string {
  return (raw ?? '').normalize('NFC').replace(/[\s\p{Z}\uFEFF]+/gu, ' ').trim();
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemeCount = (text: string): number => [...segmenter.segment(text)].length;

const isMalayalam = (cp: number) => cp >= 0x0d00 && cp <= 0x0d7f;
const isPunctuation = (ch: string) => ch === '.' || ch === "'" || ch === '-';

function isLetter(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  if (isMalayalam(cp)) return /\p{L}/u.test(ch);
  return /\p{L}/u.test(ch) && /\p{Script=Latin}/u.test(ch);
}

function allowed(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return (
    isLetter(ch) ||
    isMalayalam(cp) ||
    cp === 0x200c ||
    cp === 0x200d ||
    (cp >= 0x30 && cp <= 0x39) ||
    ch === ' ' ||
    isPunctuation(ch)
  );
}

function reserved(name: string): boolean {
  // Without invisible joiners and with width/compatibility forms folded (mirrors core).
  const folded = name.normalize('NFKC').replace(/[\u200c\u200d]/g, '').toLowerCase();
  return (
    folded === 'minnal' ||
    folded === 'മിന്നൽ' ||
    folded === 'minnal bot' ||
    folded === 'bot' ||
    folded === 'admin' ||
    /^guest \d+$/.test(folded)
  );
}

export function validateName(raw: string | null | undefined): NameResult {
  const name = normaliseName(raw);
  const length = graphemeCount(name);
  if (length < NAME_MIN || length > NAME_MAX) return { ok: false, code: 'length' };
  const chars = [...name];
  if (!chars.every(allowed) || /[\u200c\u200d]{2}/.test(name)) return { ok: false, code: 'chars' };
  if (!isLetter(chars[0]!)) return { ok: false, code: 'start' };
  for (let i = 1; i < name.length; i += 1) {
    if (isPunctuation(name[i]!) && isPunctuation(name[i - 1]!)) return { ok: false, code: 'punctuation' };
  }
  if (reserved(name)) return { ok: false, code: 'reserved' };
  return { ok: true, name };
}

/** The Google given name as a prefill, only when it passes the rule. */
export function prefillName(givenName: string | null | undefined): string {
  const result = validateName(givenName);
  return result.ok ? result.name : '';
}
