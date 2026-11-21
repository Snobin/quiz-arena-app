import { describe, expect, it } from 'vitest';
import i18n from '../../i18n.ts';
import { LANGUAGES } from '../../i18n/catalogue.ts';
import { practiceCatalogue, type PracticeKey } from './practiceCatalogue.ts';

describe('practice catalogue', () => {
  it('has Malayalam and English copy for every key and renders it with its example params', () => {
    for (const [key, entry] of Object.entries(practiceCatalogue) as [PracticeKey, (typeof practiceCatalogue)[PracticeKey]][]) {
      for (const language of LANGUAGES) {
        expect(entry[language], `${key}:${language}`).toBeTruthy();
        const params = ('params' in entry ? (entry.params as Record<string, Record<string, string | number>>)[language] : undefined) ?? {};
        const text = i18n.getFixedT(language)(key, params);
        expect(text, `${key}:${language}`).not.toBe(key);
        expect(text).not.toMatch(/\{\{/);
      }
    }
  });
});
