import { afterEach, describe, expect, it, vi } from 'vitest';
import { brandLanguage, deviceLanguage } from './language.ts';

describe('deviceLanguage', () => {
  it.each([
    [['ml-IN'], 'ml'],
    [['ml'], 'ml'],
    [['ML_in'], 'ml'],
    [['en-GB', 'ml-IN'], 'ml'],
    [['ta-IN', 'en-GB'], 'en'],
    [['en-US'], 'en'],
    [['mlx'], 'en'],
    [['hi-IN', 'mr'], 'en'],
    [[], 'en'],
  ] as const)('%j -> %s', (languages, expected) => {
    expect(deviceLanguage(languages)).toBe(expected);
  });

  it('is not brandLanguage (which maps anything non-English to Malayalam)', () => {
    expect(brandLanguage('ta-IN')).toBe('ml');
    expect(deviceLanguage(['ta-IN'])).toBe('en');
  });
});

describe('i18n boot language', () => {
  const original = navigator.languages;

  afterEach(() => {
    Object.defineProperty(window.navigator, 'languages', { value: original, configurable: true });
    vi.resetModules();
  });

  async function bootWith(languages: string[]) {
    Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
    vi.resetModules();
    const { default: i18n } = await import('./index.ts');
    return i18n;
  }

  it('a Malayalam phone boots in Malayalam with <html lang="ml">', async () => {
    const i18n = await bootWith(['ml-IN', 'en-IN']);
    expect(i18n.language).toBe('ml');
    expect(document.documentElement.lang).toBe('ml');
    expect(i18n.t('home.guestHeader')).toBe('അതിഥിയായി കളിക്കുന്നു');
  });

  it("['ta-IN', 'en-GB'] boots in English with <html lang=\"en\">", async () => {
    const i18n = await bootWith(['ta-IN', 'en-GB']);
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(i18n.t('home.guestHeader')).toBe('Playing as guest');
  });
});
