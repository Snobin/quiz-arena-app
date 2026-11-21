import { describe, expect, it } from 'vitest';
import i18n from '../../i18n.ts';
import { LANGUAGES } from '../../i18n/catalogue.ts';
import { roomCatalogue, type RoomKey } from './roomCatalogue.ts';

describe('room catalogue', () => {
  it('has Malayalam and English copy for every key, flagged for sign-off, and renders it with its example params', () => {
    for (const [key, entry] of Object.entries(roomCatalogue) as [RoomKey, (typeof roomCatalogue)[RoomKey]][]) {
      for (const language of LANGUAGES) {
        expect(entry[language], `${key}:${language}`).toBeTruthy();
        expect(entry.signoff, `${key} signoff`).toContain(language);
        const params = ('params' in entry ? (entry.params as Record<string, Record<string, string | number>>)[language] : undefined) ?? {};
        const text = i18n.getFixedT(language)(key, params);
        expect(text, `${key}:${language}`).not.toBe(key);
        expect(text).not.toMatch(/\{\{/);
      }
    }
  });

  it('puts the lobby title in the shape "Battle Room · K7M-Q2X · Minnal"', () => {
    const t = i18n.getFixedT('en');
    expect(t('title.withBrand', { title: t('rooms.lobby.title', { code: 'K7M-Q2X' }), brand: t('brand.name') })).toBe('Battle Room · K7M-Q2X · Minnal');
  });
});
