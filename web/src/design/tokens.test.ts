import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colors, darkSwapped, motion, motionTokens, rounded, spacing, themeVariables, typography } from './tokens.ts';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const themeCss = read('./theme.css');
const designMd = read('../../../_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/DESIGN.md');

/** The `@theme static { ... }` block's declarations (wildcard resets excluded). */
function themeDeclarations(): Record<string, string> {
  const start = themeCss.indexOf('@theme static {');
  const end = themeCss.indexOf('\n}', start);
  expect(start).toBeGreaterThanOrEqual(0);
  const block = themeCss.slice(start, end);
  const vars: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
    if (value!.trim() !== 'initial') vars[name!] = value!.trim(); // namespace resets
  }
  return vars;
}

type Section = Record<string, string | Record<string, string>>;

/** Minimal parser for the DESIGN.md frontmatter token sections (2-level maps of scalars). */
function designSection(name: string): Section {
  const frontmatter = designMd.split(/^---$/m)[1]!;
  const lines = frontmatter.split('\n');
  const startIndex = lines.findIndex((line) => line === `${name}:`);
  expect(startIndex, `DESIGN.md section ${name}`).toBeGreaterThanOrEqual(0);
  const section: Section = {};
  let current: Record<string, string> | null = null;
  for (const line of lines.slice(startIndex + 1)) {
    if (/^\S/.test(line)) break; // next top-level key
    const match = /^( +)('?)([\w-]+)\2:\s*(.*)$/.exec(line);
    if (!match) continue; // comments and blank lines
    const [, indent, , key, rawValue] = match as unknown as [string, string, string, string, string];
    const value = scalar(rawValue);
    if (indent.length === 2) {
      if (value === '') section[key] = current = {};
      else {
        section[key] = value;
        current = null;
      }
    } else if (current) {
      current[key] = value;
    }
  }
  return section;
}

function scalar(raw: string): string {
  const quoted = /^'([^']*)'/.exec(raw);
  if (quoted) return quoted[1]!;
  return raw.replace(/\s+#.*$/, '').trim();
}

describe('design tokens', () => {
  it('theme.css @theme declares exactly the TS token values', () => {
    expect(themeDeclarations()).toEqual(themeVariables());
  });

  it('transcribes every DESIGN.md colour, rounded, spacing and motion token exactly', () => {
    expect(designSection('colors')).toEqual(colors);
    expect(designSection('rounded')).toEqual(rounded);
    expect(designSection('spacing')).toEqual(spacing);
    expect(designSection('motion')).toEqual(motionTokens);
  });

  it('transcribes every DESIGN.md typography token exactly, in rem', () => {
    expect(designSection('typography')).toEqual(typography);
    for (const [name, token] of Object.entries(typography)) {
      expect(token.fontSize, name).toMatch(/^\d+(\.\d+)?rem$/);
    }
  });

  it('swaps exactly the semantic surface colours to their -dark values in dark mode', () => {
    const media = themeCss.slice(themeCss.indexOf('@media (prefers-color-scheme: dark)'));
    const block = media.slice(0, media.indexOf('}'));
    const swaps = [...block.matchAll(/(--color-[\w-]+)\s*:\s*var\((--color-[\w-]+)\)/g)].map(([, from, to]) => [from, to]);
    expect(swaps).toEqual(darkSwapped.map((name) => [`--color-${name}`, `--color-${name}-dark`]));
    for (const name of darkSwapped) expect(colors).toHaveProperty(`${name}-dark`);
  });

  it('exports motion constants in ms', () => {
    expect(motion.flashWindow).toBe(1000);
    expect(motion.winHold).toBe(1600);
    expect(motion.reducedChipFade).toBe(120);
    expect(motion.easingOvertake).toBe('cubic-bezier(.34,1.4,.64,1)');
  });

  it('never uses volt for the focus ring', () => {
    const bodies = [...themeCss.matchAll(/:focus-visible[^{}]*\{([^}]*)\}/g)].map(([, body]) => body!);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).toMatch(/outline(-color)?:/);
      expect(body).not.toMatch(/vo[l]t/);
    }
  });
});
