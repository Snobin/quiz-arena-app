import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../i18n.ts';
import { buildCardText, shareUrl } from './cardText.ts';
import { CASES, SELF } from './cardFixtures.ts';

const ORIGIN = 'https://minnal.example';
const byName = (name: string) => CASES.find((c) => c.name === name)!.payload;

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('the result and mode lines', () => {
  it('reads the epic lines in English', () => {
    const text = (name: string) => buildCardText(byName(name), SELF, 'en', ORIGIN)!;
    expect(text('quick win')).toMatchObject({ resultLine: 'Anju beat Vishnu', selfScore: '7,840', rivalScore: '7,420', modeLine: 'Quick Match' });
    expect(text('quick loss')).toMatchObject({ resultLine: 'Vishnu won · Anju 7,420', rivalScore: '7,840' });
    expect(text('quick draw').resultLine).toBe('Anju drew with Vishnu');
    expect(text('duel win against a bot')).toMatchObject({ resultLine: 'Anju beat Minnal Bot', modeLine: 'Topic Duel · Kerala History' });
    expect(text('room sole #1')).toMatchObject({ resultLine: 'Anju won · 23 players', modeLine: 'Battle Room · Kerala History', rivalScore: null });
    expect(text('room joint win').resultLine).toBe('Anju · joint win · 23 players');
    expect(text('room #7 of 23').resultLine).toBe('Anju came #7 of 23');
  });

  it('reads the same lines in Malayalam with the name unchanged and a separator', () => {
    const text = (name: string) => buildCardText(byName(name), SELF, 'ml', ORIGIN)!;
    expect(text('quick win')).toMatchObject({ resultLine: 'Anju · ജയിച്ചു · Vishnu', modeLine: 'ക്വിക്ക് മാച്ച്' });
    expect(text('quick loss').resultLine).toBe('Vishnu · ജയിച്ചു · Anju 7,420');
    expect(text('quick draw').resultLine).toBe('Anju · സമനില · Vishnu');
    expect(text('duel win against a bot').resultLine).toBe('Anju · ജയിച്ചു · മിന്നൽ ബോട്ട്');
    expect(text('room sole #1').resultLine).toBe('Anju · ജയിച്ചു · 23 പേർ');
    expect(text('room joint win').resultLine).toBe('Anju · സംയുക്ത ജയം · 23 പേർ');
    expect(text('room #7 of 23').resultLine).toBe('Anju · 7-ാം സ്ഥാനം · 23 പേരിൽ');
    expect(text('quick win').cta).toBe('എന്നെ തോൽപ്പിക്കൂ');
  });

  it('writes the share text for a win exactly as the epic does, and a matching one for the others', () => {
    expect(buildCardText(byName('quick win'), SELF, 'en', ORIGIN)!.shareText).toBe('I beat Vishnu 7,840 – 7,420 on Minnal. Beat me:');
    expect(buildCardText(byName('quick loss'), SELF, 'en', ORIGIN)!.shareText).toBe('Vishnu beat me 7,840 – 7,420 on Minnal. Beat me:');
    expect(buildCardText(byName('quick draw'), SELF, 'en', ORIGIN)!.shareText).toBe('I drew with Vishnu 7,420 – 7,420 on Minnal. Beat me:');
    expect(buildCardText(byName('room #7 of 23'), SELF, 'en', ORIGIN)!.shareText).toBe('I came #7 of 23 in a Battle Room on Minnal. Beat me:');
  });

  it('never names a private custom topic', () => {
    for (const language of ['en', 'ml'] as const) {
      const card = buildCardText(byName('custom room'), SELF, language, ORIGIN)!;
      expect(card.modeLine).toBe(language === 'en' ? 'Battle Room' : 'ബാറ്റിൽ റൂം');
      expect(JSON.stringify(card)).not.toContain('Renaissance');
    }
  });

  it('is null for a participant who is not in the match', () => {
    expect(buildCardText(byName('quick win'), 'nobody', 'en', ORIGIN)).toBeNull();
  });
});

describe('the link', () => {
  it('is the public origin plus /q with no query, id, name or tracking, shown without the scheme', () => {
    const card = buildCardText(byName('quick win'), SELF, 'en', ORIGIN)!;
    expect(card.url).toBe('https://minnal.example/q');
    expect(card.linkLabel).toBe('minnal.example/q');
    for (const c of CASES) {
      const url = buildCardText(c.payload, SELF, 'en', ORIGIN)!.url;
      expect(url).not.toMatch(/[?#=&]/);
      expect(url).not.toContain(c.payload.matchId === 'm' ? 'matchId' : 'm');
    }
    expect(shareUrl('https://x.example')).toBe('https://x.example/q');
  });
});
