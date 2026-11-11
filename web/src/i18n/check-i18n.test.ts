import { describe, expect, it } from 'vitest';
import { FIXTURE_MARKER, MissingPathError, checkPaths, checkSource } from '../../scripts/check-i18n.mjs';

// Fixture sources are built by concatenation so this file never carries the marker whole
// (tests are exempt from the text rules, but a misplaced marker is flagged anywhere).
const MARKER = '// check-i18n: ' + 'dev-fixture';
const rules = (file: string, text: string) => checkSource(file, text).map((v) => v.rule);

describe('check-i18n: JSX text', () => {
  it('fails on JSX text with letters, naming file and line', () => {
    expect(checkSource('src/screens/Home.tsx', 'const a = 1;\nexport const H = () => <p>Hello</p>;')).toEqual([
      expect.objectContaining({ file: 'src/screens/Home.tsx', line: 2, rule: 'jsx-text', match: 'Hello' }),
    ]);
  });

  it('fails on Malayalam JSX text too', () => {
    expect(rules('src/a.tsx', '<p>മിന്നൽ</p>')).toEqual(['jsx-text']);
  });

  it('allows punctuation-only text, expressions and catalogue lookups', () => {
    const clean = "<p>{t('match.locked')} · {count} …</p>\n<b>{name}</b>";
    expect(checkSource('src/a.tsx', clean)).toEqual([]);
  });

  it.each([
    ['a literal child', "<p>{'Hello'}</p>"],
    ['a conditional child', "<p>{err ? 'API unreachable' : '…'}</p>"],
    ['a double-quoted child of a component', '<Button>{"Save"}</Button>'],
    ['a fragment child', "<>{'Hello'}</>"],
  ])('fails on %s', (_, text) => {
    expect(rules('src/a.tsx', text)).toEqual(['jsx-text']);
  });

  it('ignores comments', () => {
    expect(checkSource('src/a.tsx', '// <p>Hello</p>\nconst x = <p>{/* Hello */}</p>;')).toEqual([]);
  });
});

describe('check-i18n: attributes and document.title', () => {
  it.each([
    'aria-label',
    'aria-description',
    'aria-roledescription',
    'aria-valuetext',
    'aria-placeholder',
    'title', 'alt', 'placeholder', 'label', 'disabledReason'])('fails on a literal %s', (name) => {
    expect(rules('src/a.tsx', `<X ${name}="Close" />`)).toEqual(['literal-attribute']);
    expect(rules('src/a.tsx', `<X ${name}={'Close'} />`)).toEqual(['literal-attribute']);
  });

  it('fails on literals in conditional and template branches', () => {
    expect(rules('src/a.tsx', "<X aria-label={on ? 'Open' : t('close')} />")).toEqual(['literal-attribute']);
    expect(rules('src/a.tsx', '<X title={`Hi ${name}`} />')).toEqual(['literal-attribute']);
  });

  it('allows t() calls, variables and unlisted attributes', () => {
    expect(checkSource('src/a.tsx', "<X aria-label={t('a.b')} title={label} className=\"p-2\" lang=\"en\" />")).toEqual([]);
  });

  it('fails on a literal document.title assignment', () => {
    expect(rules('src/a.ts', "document.title = 'Minnal';")).toEqual(['document-title']);
    expect(rules('src/a.ts', 'window.document.title = `${x} · Minnal`;')).toEqual(['document-title']);
    expect(rules('src/a.ts', 'document.title = full;')).toEqual([]);
  });

  it('fails on a literal useDocumentTitle argument', () => {
    expect(rules('src/a.tsx', "useDocumentTitle('Ranks');")).toEqual(['document-title']);
    expect(rules('src/a.tsx', "useDocumentTitle(t('tab.ranks'));\nuseDocumentTitle();")).toEqual([]);
  });
});

describe('check-i18n: exemptions', () => {
  const fixture = '<p>Dev only</p>';

  it('exempts tests', () => {
    expect(checkSource('src/screens/Home.test.tsx', fixture)).toEqual([]);
    expect(checkSource('src/a.test.ts', "document.title = 'x';")).toEqual([]);
  });

  it('exempts only src/design/*Fixture.tsx files that carry the marker', () => {
    expect(checkSource('src/design/ShapingFixture.tsx', `${MARKER}\n${fixture}`)).toEqual([]);
    expect(rules('src/design/ShapingFixture.tsx', fixture)).toEqual(['jsx-text']);
  });

  it('flags the marker anywhere else, and still checks the file', () => {
    expect(rules('src/screens/Home.tsx', `${MARKER}\n${fixture}`)).toEqual(['misplaced-marker', 'jsx-text']);
    expect(rules('src/design/Fixture.ts', `${MARKER}\n`)).toEqual(['misplaced-marker']);
    expect(rules('src/design/nested/AFixture.tsx', `${MARKER}\n`)).toEqual(['misplaced-marker']);
    expect(rules('src/x.test.ts', `${MARKER}\n`)).toEqual(['misplaced-marker']);
    expect(FIXTURE_MARKER).toBe(MARKER.slice(3));
  });
});

describe('check-i18n: files', () => {
  it('throws MissingPathError for a missing path', () => {
    expect(() => checkPaths(['src/does-not-exist'])).toThrow(MissingPathError);
  });

  it('finds no violations in the real source tree', () => {
    expect(checkPaths(['src'])).toEqual([]);
  });
});
