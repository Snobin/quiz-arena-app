import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../i18n.ts';
import { CARD_COLORS, CARD_SIZE, fit, layoutCard, MIN_TEXT_PX, type Measure } from './cardLayout.ts';
import { buildCardText } from './cardText.ts';
import { CASES, SELF } from './cardFixtures.ts';

/** A stand-in for the canvas: every glyph is 0.55 em wide (a Malayalam conjunct is wider, so this is generous). */
const measure: Measure = (text, size) => Array.from(text).length * size * 0.55;

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const wordmark = (language: 'en' | 'ml') => (language === 'en' ? 'Minnal' : 'മിന്നൽ');

describe('the card layout', () => {
  for (const language of ['en', 'ml'] as const) {
    for (const { name, payload } of CASES) {
      it(`${name} (${language}): text never under ${MIN_TEXT_PX}px, inside the canvas, volt only where DESIGN allows`, () => {
        const card = buildCardText(payload, SELF, language, 'https://minnal.example')!;
        const ops = layoutCard(card, wordmark(language), measure);
        const texts = ops.flatMap((op) => (op.kind === 'text' ? [op] : []));
        for (const text of texts) {
          expect(text.size, `${text.role} size`).toBeGreaterThanOrEqual(MIN_TEXT_PX);
          expect(text.y, `${text.role} baseline`).toBeLessThanOrEqual(CARD_SIZE);
          expect(measure(text.text, text.size, text.weight), `${text.role} width`).toBeLessThanOrEqual(CARD_SIZE - 72 * 2 + 0.5);
        }
        // The field is the band, the first operation, with the 18px radius; nothing else is drawn under it.
        expect(ops[0]).toMatchObject({ kind: 'field', size: 1080, radius: 18, fill: CARD_COLORS.band });
        // Volt is for the bolt, her score, the call to action and the link: never the result line, mode line or rival's score.
        const volt = ops.filter((op) => op.fill === CARD_COLORS.volt).map((op) => (op.kind === 'text' ? op.role : op.kind));
        expect(volt.sort()).toEqual(['bolt', 'cta', 'link', 'score']);
        expect(texts.find((t) => t.role === 'result')!.fill).toBe(CARD_COLORS.white);
        expect(texts.find((t) => t.role === 'mode')!.fill).toBe(CARD_COLORS.muted);
        // The opponent's score appears only in a 1v1, in the muted colour.
        const rival = texts.find((t) => t.role === 'rival-score');
        expect(Boolean(rival)).toBe(card.rivalScore !== null);
        if (rival) expect(rival.fill).toBe(CARD_COLORS.muted);
        // The link line has no scheme, and nothing on the card carries a private id or a custom topic name.
        expect(texts.find((t) => t.role === 'link')!.text).toBe('minnal.example/q');
        expect(JSON.stringify(ops)).not.toMatch(/Renaissance|p-self|matchId/);
      });
    }
  }

  it('a very long name shrinks to 40px and is then cut with an ellipsis rather than overflowing', () => {
    const long = 'A'.repeat(120);
    const result = fit(`${long} beat Vishnu`, 936, 76, 700, measure);
    expect(result.size).toBe(MIN_TEXT_PX);
    expect(result.text.endsWith('…')).toBe(true);
    expect(measure(result.text, result.size, 700)).toBeLessThanOrEqual(936);
    expect(fit('Anju beat Vishnu', 936, 76, 700, measure)).toEqual({ text: 'Anju beat Vishnu', size: 76 });
  });
});
