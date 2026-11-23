import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n.ts';
import { CARD_COLORS, CARD_SIZE, layoutCard } from './cardLayout.ts';
import { buildCardText } from './cardText.ts';
import { CASES, SELF } from './cardFixtures.ts';
import { paint, renderCard } from './drawCard.ts';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

/** A context that records what is drawn, in order. */
function recorder() {
  const log: string[] = [];
  const ctx = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    clearRect: () => log.push('clear'),
    beginPath: () => log.push('begin'),
    moveTo: () => log.push('move'),
    lineTo: () => log.push('line'),
    closePath: () => log.push('close'),
    fill: () => log.push(`fill ${ctx.fillStyle}`),
    fillRect: () => log.push(`rect ${ctx.fillStyle}`),
    roundRect: (_x: number, _y: number, w: number, _h: number, r: number) => log.push(`round ${w} ${r}`),
    fillText: (text: string) => log.push(`text ${ctx.font.split(' ')[1]} ${ctx.fillStyle} ${text}`),
    measureText: (text: string) => ({ width: text.length * 20 }),
  };
  return { ctx, log };
}

describe('drawing the card', () => {
  it('runs the operations in order: the rounded field first, the bolt, then the text, with the right sizes and colours', () => {
    const card = buildCardText(CASES[0]!.payload, SELF, 'en', 'https://minnal.example')!;
    const { ctx, log } = recorder();
    paint(ctx as never, layoutCard(card, 'Minnal', (t, size) => t.length * size * 0.5));
    expect(log.slice(0, 3)).toEqual(['clear', 'begin', `round ${CARD_SIZE} 18`]);
    expect(log[3]).toBe('fill #101216');
    expect(log).toContain(`fill ${CARD_COLORS.volt}`);
    expect(log.filter((l) => l.startsWith('line')).length).toBe(6);
    expect(log).toContain(`text 260px ${CARD_COLORS.volt} 7,840`);
    expect(log.some((l) => l === 'text 76px #FFFFFF Anju beat Vishnu')).toBe(true);
    expect(log.some((l) => l.startsWith('text') && l.endsWith('minnal.example/q'))).toBe(true);
  });

  it('renders a 1080 x 1080 PNG through the canvas, or null when there is no 2d context', async () => {
    const card = buildCardText(CASES[0]!.payload, SELF, 'en', 'https://minnal.example')!;
    const { ctx } = recorder();
    const png = new Blob(['x'], { type: 'image/png' });
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: vi.fn((cb: (b: Blob | null) => void, type?: string) => cb(type === 'image/png' ? png : null)) };
    await expect(renderCard(card, 'Minnal', () => canvas as never)).resolves.toBe(png);
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
    const none = { width: 0, height: 0, getContext: () => null, toBlob: vi.fn() };
    await expect(renderCard(card, 'Minnal', () => none as never)).resolves.toBeNull();
  });
});
