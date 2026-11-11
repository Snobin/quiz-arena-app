import { describe, expect, it } from 'vitest';
import { MissingPathError, checkPaths, checkSource, isPeakPath } from '../../scripts/check-tokens.mjs';

// Built by concatenation so this file never trips the scan itself.
const VOLT = 'vo' + 'lt';
const DIM = 'di' + 'm';
const VOLT_HEX = '#D4' + 'FF2A';
const DIM_HEX = '#9A' + 'A0AA';
const OUTLINE_NONE = 'outline' + '-none';
const OUTLINE_NONE_CSS = 'outline: ' + 'none';

const rules = (file: string, text: string) => checkSource(file, text).map((v) => v.rule);

describe('check-tokens: volt', () => {
  it('fails on a volt utility outside design/peak/, naming file and line', () => {
    const violations = checkSource('src/screens/Home.tsx', `const a = 1;\n<p className="p-4 text-${VOLT}">x</p>`);
    expect(violations).toEqual([
      expect.objectContaining({ file: 'src/screens/Home.tsx', line: 2, rule: 'volt-outside-peak' }),
    ]);
  });

  it.each([
    ['var()', `.x { border-color: var(--color-${VOLT}); }`],
    ['variant + opacity', `"hover:bg-${VOLT}/50"`],
    ['arbitrary var', `"bg-[var(--color-${VOLT})]"`],
    ['v4 variable shorthand', `"bg-(--color-${VOLT})"`],
    ['hex literal', `style={{ background: '${VOLT_HEX.toLowerCase()}' }}`],
    ['TS property access', `style={{ color: colors.${VOLT} }}`],
    ['TS index access', `colors['${VOLT}']`],
  ])('fails on %s outside design/peak/', (_, text) => {
    expect(rules('src/a.tsx', text)).toEqual(['volt-outside-peak']);
  });

  it('reports the right line for a multi-line declaration', () => {
    const text = `.a {\n  border-color:\n    var(\n      --color-${VOLT}\n    );\n}`;
    expect(checkSource('src/a.css', text)).toEqual([expect.objectContaining({ line: 4, rule: 'volt-outside-peak' })]);
  });

  it('allows volt inside design/peak/, resolved against the web root', () => {
    expect(checkSource('src/design/peak/RevealBand.tsx', `"bg-band text-${VOLT}"`)).toEqual([]);
    expect(isPeakPath('src/design/peak/x.tsx')).toBe(true);
    expect(isPeakPath('other/src/design/peak/x.tsx')).toBe(false);
  });

  it('allows on-volt (text-on-volt, hover:bg-on-volt/50)', () => {
    expect(checkSource('src/a.tsx', `"text-on-${VOLT} hover:bg-on-${VOLT}/50"`)).toEqual([]);
  });
});

describe('check-tokens: dim', () => {
  it.each([
    ['utility', `"text-${DIM}"`],
    ['variant dark utility', `"md:text-${DIM}-dark"`],
    ['arbitrary var', `"text-[var(--color-${DIM})]"`],
    ['v4 variable shorthand', `"text-(--color-${DIM})"`],
    ['CSS color', `p { color: var(--color-${DIM}); }`],
    ['multi-line CSS color', `p {\n  color:\n    var(--color-${DIM});\n}`],
  ])('fails on dim as text: %s (even in peak)', (_, text) => {
    expect(rules('src/design/peak/x.tsx', text)).toEqual(['dim-as-text']);
  });

  it.each([
    ['hex literal', `const c = '${DIM_HEX}';`],
    ['TS property access', `style={{ borderColor: colors.${DIM} }}`],
    ['TS index access, dark', `colors['${DIM}-dark']`],
  ])('fails on the raw dim value: %s', (_, text) => {
    expect(rules('src/a.tsx', text)).toEqual(['dim-raw-value']);
  });
});

describe('check-tokens: outline', () => {
  it('fails on a removed outline without a focus-visible replacement', () => {
    expect(rules('src/a.tsx', `<a className="p-2 focus:${OUTLINE_NONE}" />`)).toEqual([OUTLINE_NONE]);
    expect(rules('src/a.css', `.x { ${OUTLINE_NONE_CSS}; }`)).toEqual([OUTLINE_NONE]);
    expect(rules('src/a.tsx', `style={{ outline: '${'no' + 'ne'}' }}`)).toEqual([OUTLINE_NONE]);
  });

  it('passes when the same element or rule sets a focus-visible replacement', () => {
    expect(rules('src/a.tsx', `<a className="${OUTLINE_NONE} focus-visible:ring-2" />`)).toEqual([]);
    expect(rules('src/a.css', `.x { ${OUTLINE_NONE_CSS}; }\n.x:focus-visible { box-shadow: 0 0 0 2px; }`)).toEqual([]);
  });
});

describe('check-tokens: files', () => {
  it('passes a clean file (dim borders, on-band text)', () => {
    const clean = `<span className="border border-${DIM} text-muted bg-card" />\n.c { background-color: var(--color-${DIM}); }`;
    expect(checkSource('src/a.tsx', clean)).toEqual([]);
  });

  it('exempts only the token files and the named fixture region', () => {
    const tokenDef = `--color-${VOLT}: ${VOLT_HEX};`;
    expect(checkSource('src/design/theme.css', tokenDef)).toEqual([]);
    expect(checkSource('src/design/tokens.ts', `${VOLT}: '${VOLT_HEX}',`)).toEqual([]);
    expect(rules('src/design/other.css', tokenDef)).toHaveLength(2);
    const region = `/* check-tokens: swatch-list start */ '${VOLT_HEX}' /* check-tokens: swatch-list end */ '${VOLT_HEX}'`;
    expect(rules('src/design/DesignFixture.tsx', region)).toEqual(['volt-outside-peak']);
    expect(rules('src/Other.tsx', region)).toHaveLength(2);
  });

  it('throws MissingPathError for a missing path', () => {
    expect(() => checkPaths(['src/does-not-exist'])).toThrow(MissingPathError);
  });

  it('finds no violations in the real source tree', () => {
    expect(checkPaths(['src', 'index.html'])).toEqual([]);
  });
});
