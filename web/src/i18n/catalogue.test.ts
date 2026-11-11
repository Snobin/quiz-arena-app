import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import i18n from '../i18n.ts';
import { LANGUAGES, catalogue, pendingSignoff, type CatalogueKey, type Entry, type Language, type MessageKey } from './catalogue.ts';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const experience = read('../../../_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/EXPERIENCE.md');

type Row = { moment: string; ml: string; en: string };

/** The Voice and Tone table rows (Moment | Malayalam | English). */
function voiceAndToneRows(): Row[] {
  const section = experience.slice(experience.indexOf('## Voice and Tone'));
  const body = section.slice(0, section.indexOf('\n## ', 1));
  const lines = body.split('\n').filter((line) => line.startsWith('|'));
  const header = lines[0]?.split('|').map((c) => c.trim());
  if (!header || header[1] !== 'Moment' || header[2] !== 'Malayalam' || header[3] !== 'English') {
    throw new Error('EXPERIENCE.md: Voice and Tone table (| Moment | Malayalam | English |) not found');
  }
  return lines.slice(2).map((line) => {
    const [, moment, ml, en] = line.split('|').map((c) => c.trim());
    return { moment: moment!, ml: ml!, en: en! };
  });
}

const ASSUMPTION = '[ASSUMPTION] ';

/** The only strings that are '' (none by design) rather than null (TBD). */
const NONE_BY_DESIGN = new Set(['result.winSlang:en']);
const rows = voiceAndToneRows();
const entries = Object.entries(catalogue) as [CatalogueKey, Entry][];
const byMoment = new Map(entries.filter(([, e]) => e.moment).map(([key, e]) => [e.moment!, [key, e] as const]));

/** Renders a catalogue entry in one language through i18next, with its example params. */
function render(key: CatalogueKey, entry: Entry, language: Language): string {
  const base = key.replace(/_(?:one|other)$/, '') as MessageKey;
  return i18n.getFixedT(language)(base, entry.params?.[language] ?? {});
}

describe('catalogue vs EXPERIENCE.md Voice and Tone', () => {
  it('parses a non-empty table', () => {
    expect(rows.length).toBeGreaterThan(15);
  });

  it('has unique Moment rows and unique catalogue moments', () => {
    const duplicates = (list: string[]) => list.filter((item, i) => list.indexOf(item) !== i);
    expect(duplicates(rows.map((row) => row.moment)), 'duplicate Voice and Tone Moment rows').toEqual([]);
    expect(
      duplicates(entries.flatMap(([, e]) => (e.moment ? [e.moment] : []))),
      'duplicate catalogue moments',
    ).toEqual([]);
  });

  it('has exactly one catalogue entry per Moment row', () => {
    const missing = rows.filter((row) => !byMoment.has(row.moment)).map((row) => row.moment);
    expect(missing, 'Voice and Tone rows with no catalogue entry (copy drift)').toEqual([]);
    const extra = [...byMoment.keys()].filter((moment) => !rows.some((row) => row.moment === moment));
    expect(extra, 'catalogue moments that are not in the Voice and Tone table (copy drift)').toEqual([]);
  });

  describe.each(rows.flatMap((row) => LANGUAGES.map((language) => [row.moment, language, row[language]] as const)))(
    '%s (%s)',
    (moment, language, cell) => {
      const found = byMoment.get(moment);
      const assumption = cell.startsWith(ASSUMPTION);
      const expected = assumption ? cell.slice(ASSUMPTION.length) : cell;
      const none = expected === '—' || /\bTBD\b/.test(expected);

      it('matches the table copy', () => {
        if (!found) return; // reported by the one-entry-per-row test
        const [key, entry] = found;
        const where = `copy drift in Voice and Tone › "${moment}" (${language}), catalogue key ${key}`;
        if (none) {
          const allowed = NONE_BY_DESIGN.has(`${key}:${language}`) ? '' : null;
          expect(
            entry[language],
            `${where}: the table has no copy ("${cell}"), so the catalogue must hold ` +
              (allowed === '' ? "'' (none by design)" : 'null (TBD, falls back to the other language)'),
          ).toBe(allowed);
        } else {
          expect(entry[language], `${where}: the table has "${expected}" but the catalogue has no copy`).not.toBeNull();
          expect(render(key, entry, language), `${where}: expected "${expected}"`).toBe(expected);
        }
      });

      it('flags an [ASSUMPTION] for sign-off, and nothing else', () => {
        if (!found) return;
        const [key, entry] = found;
        const flagged = entry.signoff?.includes(language) ?? false;
        expect(
          flagged,
          `copy drift in Voice and Tone › "${moment}" (${language}), catalogue key ${key}: ` +
            (assumption ? 'the table marks it [ASSUMPTION] but signoff omits it' : 'signoff lists it but the table has no [ASSUMPTION]'),
        ).toBe(assumption);
      });
    },
  );
});

describe('pendingSignoff', () => {
  it('flags TBD (null) strings and [ASSUMPTION] languages', () => {
    const pending = pendingSignoff();
    expect(pending).toContainEqual({ key: 'share.cta', language: 'ml', reason: 'tbd' });
    expect(pending).toContainEqual({ key: 'leaderboard.empty', language: 'ml', reason: 'tbd' });
    expect(pending).toContainEqual({ key: 'leaderboard.empty', language: 'en', reason: 'assumption' });
    expect(pending).toContainEqual({ key: 'match.leaveConfirm', language: 'ml', reason: 'assumption' });
    expect(pending).toContainEqual({ key: 'join.full', language: 'ml', reason: 'tbd' });
  });

  it('does not flag settled copy or none-by-design strings', () => {
    const keys = pendingSignoff().map((p) => `${p.key}:${p.language}`);
    expect(keys).not.toContain('tab.play:ml');
    expect(keys).not.toContain('match.locked:en');
    expect(keys).not.toContain('result.winSlang:en'); // '' = no English peak slang, by design
  });
});

describe('catalogue shape', () => {
  it('pairs every plural _one with an _other', () => {
    for (const [key] of entries.filter(([k]) => k.endsWith('_one'))) {
      expect(catalogue).toHaveProperty(key.replace(/_one$/, '_other'));
    }
  });

  it('never leaves both languages TBD', () => {
    for (const [key, entry] of entries) expect(entry.ml ?? entry.en, key).not.toBeNull();
  });

  it('covers the shell strings: brand, tagline, probe text and the four tab labels', () => {
    for (const key of ['brand.name', 'shell.tagline', 'shell.probe.unreachable', 'tab.play', 'tab.rooms', 'tab.ranks', 'tab.me']) {
      expect(catalogue).toHaveProperty(key);
    }
    expect([catalogue['tab.play'].ml, catalogue['tab.rooms'].ml, catalogue['tab.ranks'].ml, catalogue['tab.me'].ml]).toEqual([
      'കളി',
      'റൂമുകൾ',
      'റാങ്ക്',
      'ഞാൻ',
    ]);
  });
});
