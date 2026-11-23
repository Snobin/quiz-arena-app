import { CARD_SIZE, layoutCard, type Measure, type Op } from './cardLayout.ts';
import type { CardText } from './cardText.ts';

/** The face stack the card uses: the Malayalam face first (`document.fonts.load` has waited for it), then the system fonts. */
export const CARD_FONT_FAMILY = '"Noto Sans Malayalam", "Noto Sans Malayalam Fallback", system-ui, sans-serif';
const fontOf = (size: number, weight: number) => `${weight} ${size}px ${CARD_FONT_FAMILY}`;

/** The bolt of the brand mark (`BrandMark.tsx`), hard-edged, on a 12 x 16 grid. */
const BOLT: readonly (readonly [number, number])[] = [
  [7, 0],
  [1, 9],
  [5, 9],
  [3, 16],
  [11, 6],
  [7, 6],
  [9, 0],
];

type Ctx = Pick<
  CanvasRenderingContext2D,
  'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'fill' | 'fillRect' | 'fillText' | 'measureText' | 'roundRect' | 'clearRect'
> & { fillStyle: string | CanvasGradient | CanvasPattern; font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline };

/** Runs the operations on `ctx`: a loop, nothing is decided here. */
export function paint(ctx: Ctx, ops: readonly Op[]): void {
  ctx.clearRect(0, 0, CARD_SIZE, CARD_SIZE);
  for (const op of ops) {
    ctx.fillStyle = op.fill;
    if (op.kind === 'field') {
      ctx.beginPath();
      ctx.roundRect(0, 0, op.size, op.size, op.radius);
      ctx.fill();
    } else if (op.kind === 'rule') {
      ctx.fillRect(op.x, op.y, op.width, op.height);
    } else if (op.kind === 'bolt') {
      const scale = op.height / 16;
      ctx.beginPath();
      BOLT.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(op.x + px * scale, op.y + py * scale) : ctx.lineTo(op.x + px * scale, op.y + py * scale)));
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.font = fontOf(op.size, op.weight);
      ctx.textAlign = op.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}

/** Draws the card on a new 1080 canvas and returns it as a PNG, or null when the browser cannot. */
export async function renderCard(card: CardText, wordmark: string, create: () => HTMLCanvasElement = () => document.createElement('canvas')): Promise<Blob | null> {
  const canvas = create();
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const measure: Measure = (text, size, weight) => {
    ctx.font = fontOf(size, weight);
    return ctx.measureText(text).width;
  };
  paint(ctx, layoutCard(card, wordmark, measure));
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
