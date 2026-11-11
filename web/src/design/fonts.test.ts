import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MALAYALAM_FONT_URL } from './fonts.ts';
import { typography } from './tokens.ts';

const resolveHere = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const read = (relative: string) => readFileSync(resolveHere(relative), 'utf8');
const fontsCss = read('./fonts.css');
const indexHtml = read('../../index.html');

const UNICODE_RANGE = 'U+0D00-0D7F, U+200C-200D, U+25CC, U+0964-0965';

type Face = Record<string, string>;

function fontFaces(): Face[] {
  return [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) =>
    Object.fromEntries(
      [...body!.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]),
    ),
  );
}

const faces = fontFaces();
const family = (name: string) => faces.filter((face) => face['font-family'] === `'${name}'`);

/** The declarations of the `.font-face-live` scope. */
function liveScope(): Record<string, string> {
  const start = fontsCss.indexOf('.font-face-live {');
  expect(start).toBeGreaterThanOrEqual(0);
  const body = fontsCss.slice(start, fontsCss.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--font-[\w-]+)\s*:\s*([^;]+);/g)].map(([, n, v]) => [n!, v!.trim()]));
}

describe('fonts.css faces', () => {
  it('declares the swap and Live faces over the same file and unicode-range', () => {
    const [swap] = family('Noto Sans Malayalam');
    const [live] = family('Noto Sans Malayalam Live');
    expect(swap?.['font-display']).toBe('swap');
    expect(live?.['font-display']).toBe('optional');
    for (const face of [swap!, live!]) {
      expect(face.src).toBe(`url('${MALAYALAM_FONT_URL}') format('woff2')`);
      expect(face['unicode-range']).toBe(UNICODE_RANGE);
      expect(face['font-weight']).toBe('400 700');
    }
  });

  it('declares the metric-matched fallback over local() system Malayalam faces', () => {
    const fallback = family('Noto Sans Malayalam Fallback');
    expect(fallback.map((f) => f['font-weight'])).toEqual(['400', '700']);
    for (const face of fallback) {
      expect(face.src).toMatch(/^local\('Noto Sans Malayalam UI[^']*'\)/);
      expect(face.src).toContain("local('Nirmala UI");
      expect(face.src).toContain("local('Kartika");
      expect(face.src).not.toContain('url(');
      for (const descriptor of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) {
        expect(face[descriptor], descriptor).toMatch(/^\d+(\.\d+)?%$/);
      }
      expect(face['unicode-range']).toBe(UNICODE_RANGE);
    }
  });

  it('turns font synthesis off on html', () => {
    expect(fontsCss).toMatch(/html\s*\{[^}]*font-synthesis:\s*none;/);
  });
});

describe('token stacks', () => {
  const noto = Object.entries(typography).filter(([, t]) => t.fontFamily.includes('Noto Sans Malayalam'));

  it('puts the fallback family right after Noto Sans Malayalam in every stack', () => {
    expect(noto.length).toBeGreaterThan(0);
    for (const [name, t] of noto) {
      expect(t.fontFamily, name).toContain('Noto Sans Malayalam, Noto Sans Malayalam Fallback,');
    }
  });

  it('gives every Noto stack a Live counterpart in .font-face-live, and nothing else', () => {
    const live = liveScope();
    const expected = Object.fromEntries(
      noto.map(([name, t]) => [`--font-${name}`, t.fontFamily.replace('Noto Sans Malayalam,', 'Noto Sans Malayalam Live,')]),
    );
    expect(live).toEqual(expected);
  });
});

describe('font file', () => {
  it('is preloaded from index.html', () => {
    expect(indexHtml).toContain(
      `<link rel="preload" href="${MALAYALAM_FONT_URL}" as="font" type="font/woff2" crossorigin />`,
    );
  });

  it('is committed under public/ at 40-70 KB', () => {
    const size = statSync(resolveHere(`../../public${MALAYALAM_FONT_URL}`)).size;
    expect(size).toBeGreaterThanOrEqual(40 * 1024);
    expect(size).toBeLessThanOrEqual(70 * 1024);
  });
});
