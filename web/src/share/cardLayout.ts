import type { CardText } from './cardText.ts';

/**
 * The result share card as a list of draw operations on a 1080 x 1080 canvas (Story 7.1). Pure: it takes a text measurer, so
 * it is tested without a canvas, and `drawCard.ts` is a thin loop over the operations. Colours are DESIGN's: the ink band
 * field, the band-raised rule, white, the muted on-band text and volt (volt only here, on the field).
 */
export const CARD_SIZE = 1080;
export const MIN_TEXT_PX = 40;

export const CARD_COLORS = {
  band: '#101216',
  bandRaised: '#2B3040',
  white: '#FFFFFF',
  muted: '#A7ADBA',
  volt: '#D4FF2A',
} as const;

export type Op =
  | { kind: 'field'; size: number; radius: number; fill: string }
  | { kind: 'rule'; x: number; y: number; width: number; height: number; fill: string }
  | { kind: 'bolt'; x: number; y: number; height: number; fill: string }
  | { kind: 'text'; text: string; x: number; y: number; size: number; weight: 400 | 700; fill: string; align: 'left' | 'right'; role: string };

/** Width in px of `text` at `size` px (the canvas's `measureText`, or a stand-in). */
export type Measure = (text: string, size: number, weight: 400 | 700) => number;

const MARGIN = 72;
const WIDTH = CARD_SIZE - MARGIN * 2;

/** `text` at the largest size from `start` down to `MIN_TEXT_PX` that fits `maxWidth`; cut with an ellipsis when even that is too wide. */
export function fit(text: string, maxWidth: number, start: number, weight: 400 | 700, measure: Measure): { text: string; size: number } {
  for (let size = start; size >= MIN_TEXT_PX; size -= 4) {
    if (measure(text, size, weight) <= maxWidth) return { text, size };
  }
  const chars = Array.from(text);
  while (chars.length > 1 && measure(`${chars.join('')}…`, MIN_TEXT_PX, weight) > maxWidth) chars.pop();
  return { text: `${chars.join('')}…`, size: MIN_TEXT_PX };
}

export function layoutCard(card: CardText, wordmark: string, measure: Measure): Op[] {
  const ops: Op[] = [{ kind: 'field', size: CARD_SIZE, radius: 18, fill: CARD_COLORS.band }];
  ops.push({ kind: 'bolt', x: CARD_SIZE - MARGIN - 80, y: MARGIN, height: 112, fill: CARD_COLORS.volt });
  const mark = fit(wordmark, 600, 72, 700, measure);
  ops.push({ kind: 'text', text: mark.text, x: MARGIN, y: MARGIN + 88, size: mark.size, weight: 700, fill: CARD_COLORS.white, align: 'left', role: 'wordmark' });

  const line = fit(card.resultLine, WIDTH, 76, 700, measure);
  ops.push({ kind: 'text', text: line.text, x: MARGIN, y: 330, size: line.size, weight: 700, fill: CARD_COLORS.white, align: 'left', role: 'result' });

  const score = fit(card.selfScore, WIDTH, 260, 700, measure);
  ops.push({ kind: 'text', text: score.text, x: MARGIN, y: 600, size: score.size, weight: 700, fill: CARD_COLORS.volt, align: 'left', role: 'score' });

  if (card.rivalScore !== null) {
    const rival = fit(card.rivalScore, WIDTH, 112, 700, measure);
    ops.push({ kind: 'text', text: rival.text, x: MARGIN, y: 740, size: rival.size, weight: 700, fill: CARD_COLORS.muted, align: 'left', role: 'rival-score' });
  }

  const mode = fit(card.modeLine, WIDTH, 56, 400, measure);
  ops.push({ kind: 'text', text: mode.text, x: MARGIN, y: 850, size: mode.size, weight: 400, fill: CARD_COLORS.muted, align: 'left', role: 'mode' });

  ops.push({ kind: 'rule', x: MARGIN, y: 900, width: WIDTH, height: 6, fill: CARD_COLORS.bandRaised });
  const cta = fit(card.cta, WIDTH, 56, 700, measure);
  ops.push({ kind: 'text', text: cta.text, x: MARGIN, y: 972, size: cta.size, weight: 700, fill: CARD_COLORS.volt, align: 'left', role: 'cta' });
  const link = fit(card.linkLabel, WIDTH, 48, 700, measure);
  ops.push({ kind: 'text', text: link.text, x: MARGIN, y: 1032, size: link.size, weight: 700, fill: CARD_COLORS.volt, align: 'left', role: 'link' });
  return ops;
}
