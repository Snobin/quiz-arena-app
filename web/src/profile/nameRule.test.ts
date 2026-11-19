import { describe, expect, it } from 'vitest';
import { normaliseName, prefillName, validateName } from './nameRule.ts';

// The same vectors as core's NameRuleTest: the two rules must agree.
const ACCEPT: [string, string][] = [
  ['Anju', 'Anju'],
  ['  Anju    Menon  ', 'Anju Menon'],
  ['അഞ്ജു', 'അഞ്ജു'],
  ['ആൻ', 'ആൻ'],
  ['നന്ദൻ നായർ', 'നന്ദൻ നായർ'],
  ['അഞ്ജു Menon', 'അഞ്ജു Menon'],
  ['Sree-Devi', 'Sree-Devi'],
  ['St. Mary', 'St. Mary'],
  ["O'Neil", "O'Neil"],
  ['Anju 2026', 'Anju 2026'],
  ['\u00A0Anju\u00A0', 'Anju'],
  ['\uFEFFAnju', 'Anju'],
];

const REJECT: [string, string][] = [
  ['A', 'length'],
  ['', 'length'],
  ['abcdefghijklmnopqrstuvwxy', 'length'],
  ['Anju!', 'chars'],
  ['Anju_Menon', 'chars'],
  ['Anju😀', 'chars'],
  ['Анжу', 'chars'],
  ['1Anju', 'start'],
  ['-Anju', 'start'],
  ['.Anju', 'start'],
  ['An--ju', 'punctuation'],
  ["An.'ju", 'punctuation'],
  ['minnal', 'reserved'],
  ['MINNAL', 'reserved'],
  ['Minnal Bot', 'reserved'],
  ['minnal   bot', 'reserved'],
  ['മിന്നൽ', 'reserved'],
  ['BOT', 'reserved'],
  ['Bot', 'reserved'],
  ['Admin', 'reserved'],
  ['ADMIN', 'reserved'],
  ['Guest 4821', 'reserved'],
  ['Ad\u200Dmin', 'reserved'],
  ['mi\u200Cnnal', 'reserved'],
  ['\uFF21dmin', 'reserved'],
  ['An\u200D\u200Cju', 'chars'],
  ['guest 1', 'reserved'],
];

describe('validateName', () => {
  it.each(ACCEPT)('accepts %j as %j', (input, name) => {
    expect(validateName(input)).toEqual({ ok: true, name });
  });

  it.each(['കാർത്തിക്‌', 'ക്ഷ‍ത്രിയ'])('accepts ZWJ/ZWNJ inside the Malayalam name %j', (input) => {
    expect(validateName(input).ok).toBe(true);
  });

  it.each(REJECT)('rejects %j with %s', (input, code) => {
    expect(validateName(input)).toEqual({ ok: false, code });
  });

  it('counts conjuncts as one user-perceived character', () => {
    expect(validateName('ക്ഷ'.repeat(13)).ok).toBe(true);
    expect(validateName('ക്ഷ'.repeat(25))).toEqual({ ok: false, code: 'length' });
  });

  it('keeps words that merely contain a reserved name', () => {
    for (const name of ['Minnal Fan', 'Guest Star', 'Administrator']) expect(validateName(name).ok).toBe(true);
  });

  it('treats null and blank as too short', () => {
    expect(validateName(null)).toEqual({ ok: false, code: 'length' });
    expect(validateName('   ')).toEqual({ ok: false, code: 'length' });
  });

  it('NFC-normalises', () => {
    expect(normaliseName('é')).toBe('é');
  });
});

describe('prefillName', () => {
  it('prefills a Google given name that passes the rule, else nothing', () => {
    expect(prefillName('Anju')).toBe('Anju');
    expect(prefillName('Admin')).toBe('');
    expect(prefillName(null)).toBe('');
    expect(prefillName('A')).toBe('');
  });
});
