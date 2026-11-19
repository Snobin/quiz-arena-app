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

describe('Story 1.6 strings', () => {
  const STORY_1_6 = [
    'title.match',
    'common.home',
    'badge.bot',
    'matchmaking.elapsed',
    'matchmaking.failed',
    'matchmaking.connectionFailed',
    'matchmaking.draining',
    'matchmaking.alreadyInMatch',
    'matchmaking.alreadySearching',
    'matchmaking.returnToMatch',
    'match.foundVs',
    'match.none',
  ] as const;

  it('drafts every new string in both languages, flagged for sign-off', () => {
    for (const key of STORY_1_6) {
      const entry: Entry = catalogue[key];
      expect(entry.ml, key).toBeTruthy();
      expect(entry.en, key).toBeTruthy();
      expect(entry.signoff, key).toEqual(['ml', 'en']);
    }
  });

  it('drafts every Story 1.8 string in both languages, flagged for sign-off', () => {
    const keys = Object.keys(catalogue).filter(
      (key) => /^match\./.test(key) && !/^match\.(foundVs|none|firstTapHint|locked|wrong|overtake|reconnecting|forfeited|forfeitedOneVsOne|opponentLeftWin|leaveConfirm)$/.test(key),
    ) as CatalogueKey[];
    expect([...keys, 'title.question']).toEqual(expect.arrayContaining(['match.lockTag', 'match.revealCorrect', 'match.over']));
    for (const key of [...keys, 'title.question' as const]) {
      const entry: Entry = catalogue[key];
      expect(entry.ml, key).toBeTruthy();
      expect(entry.en, key).toBeTruthy();
      expect(entry.signoff, key).toEqual(['ml', 'en']);
    }
    expect(catalogue).not.toHaveProperty('match.stubNote');
  });

  it('renders the live-match numbers and title through the number formats', () => {
    const ml = i18n.getFixedT('ml');
    const en = i18n.getFixedT('en');
    expect(ml('title.withBrand', { title: ml('title.question', { n: 4, total: 10 }), brand: ml('brand.name') })).toBe(
      'ചോദ്യം 4 / 10 · മിന്നൽ',
    );
    expect(ml('match.seconds', { count: 9 })).toBe('9 സെക്കൻഡ്');
    expect(en('match.seconds', { count: 9 })).toBe('9 seconds');
    expect(en('match.seconds', { count: 1 })).toBe('1 second');
    expect(en('match.revealCorrect', { answer: 'Periyar', points: 800, total: 3140 })).toBe(
      'Correct. Answer: Periyar. +800, total 3,140',
    );
    expect(ml('match.sourceNotAvailable')).toBe('ഉറവിടം ലഭ്യമല്ല');
  });

  it('renders the elapsed count with Latin digits', () => {
    expect(i18n.getFixedT('ml')('matchmaking.elapsed', { seconds: 12 })).toBe('12 സെക്കൻഡ്');
    expect(i18n.getFixedT('en')('matchmaking.elapsed', { seconds: 12 })).toBe('12 s');
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

  it('covers the shell strings: brand, the four tab labels and guest Home', () => {
    for (const key of ['brand.name', 'tab.play', 'tab.rooms', 'tab.ranks', 'tab.me', 'home.guestHeader', 'signIn.google']) {
      expect(catalogue).toHaveProperty(key);
    }
    expect([catalogue['tab.play'].ml, catalogue['tab.rooms'].ml, catalogue['tab.ranks'].ml, catalogue['tab.me'].ml]).toEqual([
      'കളി',
      'റൂമുകൾ',
      'റാങ്ക്',
      'ഞാൻ',
    ]);
    // The scaffold probe left Play in Story 1.5; the matchmaking stub line left in Story 1.6.
    expect(catalogue).not.toHaveProperty('matchmaking.stub');
    expect(catalogue).not.toHaveProperty('shell.tagline');
    expect(catalogue).not.toHaveProperty('shell.probe.unreachable');
  });

  it('drafts every Story 1.5 string in both languages, flagged for sign-off', () => {
    const keys = Object.keys(catalogue).filter((key) =>
      /^(home|mode|nudge|signIn|guest|common\.(back|retry|cancel)|title\.(home|signIn|matchmaking))\b/.test(key),
    ) as CatalogueKey[];
    expect(keys.length).toBeGreaterThanOrEqual(25);
    for (const key of keys) {
      const entry: Entry = catalogue[key];
      expect(entry.ml, key).toBeTruthy();
      expect(entry.en, key).toBeTruthy();
      expect(entry.signoff, key).toEqual(['ml', 'en']);
    }
  });
});

describe('display names inside Malayalam strings (Story 2.3)', () => {
  it('inserts {{name}} unchanged: its own run after a space or separator, never with a Malayalam ending attached', () => {
    const withName = Object.entries(catalogue).filter(([, entry]) => typeof entry.ml === 'string' && entry.ml.includes('{{name}}'));
    expect(withName.length).toBeGreaterThan(0);
    for (const [key, entry] of withName) {
      const ml = entry.ml as string;
      expect(ml, key).toMatch(/(?:^|[^ഀ-ൿ] )\{\{name\}\}(?![ഀ-ൿ])/);
    }
  });

  it('has Malayalam and English names for all 14 districts plus Outside Kerala', () => {
    const districts = Object.entries(catalogue).filter(([key]) => key.startsWith('district.'));
    expect(districts).toHaveLength(15);
    for (const [key, entry] of districts) {
      expect(entry.ml, key).toBeTruthy();
      expect(entry.en, key).toBeTruthy();
    }
  });
});

describe('guest results prompt copy (Story 2.4)', () => {
  const keys = ['results.prompt.title', 'results.prompt.win', 'results.prompt.loss', 'results.prompt.draw', 'results.prompt.bot'] as const;

  it('has all four variants in both languages, flagged for sign-off', () => {
    for (const key of keys) {
      const entry = catalogue[key];
      expect(entry.ml, key).toBeTruthy();
      expect(entry.en, key).toBeTruthy();
      expect(entry.signoff, key).toEqual(['ml', 'en']);
    }
  });

  it('never promises this match will be saved, rated or added to history', () => {
    for (const key of keys) {
      const { ml, en } = catalogue[key];
      expect(en as string, key).not.toMatch(/\b(saved?|history|recorded?|added|counts?)\b/i);
      expect(ml as string, key).not.toMatch(/സേവ്|ഹിസ്റ്ററി|രേഖ|റെക്കോർഡ്/);
    }
  });
});
