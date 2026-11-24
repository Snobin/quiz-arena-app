import { describe, expect, it } from 'vitest';
import i18n from '../i18n.ts';
import { importCatalogue } from '../screens/customTopics/importCatalogue.ts';
import { practiceCatalogue } from '../screens/practice/practiceCatalogue.ts';
import { installCatalogue } from '../screens/results/installCatalogue.ts';
import { practiseCatalogue } from '../screens/results/practiseCatalogue.ts';
import { roomCatalogue } from '../screens/rooms/roomCatalogue.ts';
import { LANGUAGES, type Entry } from './catalogue.ts';

// Epic 4 retro action: the strings that live with a lazy screen (so the entry chunk does not carry them) are checked like
// the main catalogue: Malayalam and English both present, the same interpolation names in both (a placeholder that exists
// in one language only prints as raw `{{...}}` or drops a number), and the bundle really registered in both languages.
const lazy = {
  practise: practiseCatalogue,
  practice: practiceCatalogue,
  import: importCatalogue,
  install: installCatalogue,
  room: roomCatalogue,
} as Record<string, Record<string, Entry>>;

/** The interpolation names in a template: `{{n, number}}` and `{{n}}` both give `n`. */
const placeholders = (text: string) => [...text.matchAll(/\{\{\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]!).sort();

describe.each(Object.entries(lazy))('lazy catalogue: %s', (_name, catalogue) => {
  const entries = Object.entries(catalogue);

  it('has entries', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s has both Malayalam and English text', (key, entry) => {
    for (const language of LANGUAGES) {
      expect(entry[language], `${key}:${language}`).toEqual(expect.any(String));
      expect((entry[language] as string).trim(), `${key}:${language}`).not.toBe('');
    }
  });

  it.each(entries)('%s uses the same interpolation names in both languages', (key, entry) => {
    expect(placeholders(entry.ml as string), key).toEqual(placeholders(entry.en as string));
  });

  it('registers every key in both languages', () => {
    for (const language of LANGUAGES) {
      for (const [key, entry] of entries) {
        expect(i18n.getResource(language, 'translation', key), `${key}:${language}`).toBe(entry[language]);
      }
    }
  });
});
