#!/usr/bin/env node
// i18n check: every user-facing string comes from the catalogue (src/i18n/catalogue.ts).
// Parsed with the TypeScript compiler API, so it sees real JSX and code, not comments.
//   1. jsx-text: JSX text containing a letter (`<p>Hello</p>`), or a letter-bearing string
//      literal as a JSX expression child (`<p>{'Hello'}</p>`, `{err ? 'Failed' : '…'}`).
//   2. literal-attribute: a string literal with a letter in aria-label, aria-description,
//      aria-roledescription, aria-valuetext, aria-placeholder, title, alt, placeholder, label or
//      disabledReason (directly, or as a branch of ?:, ||, ??, && or +).
//   3. document-title: a string literal with a letter assigned to `document.title`, or passed
//      as the first argument of `useDocumentTitle(...)`.
//   4. misplaced-marker: the dev-fixture marker outside src/design/*Fixture.tsx.
// Exempt: tests (*.test.ts / *.test.tsx), and dev fixtures, which must match
// src/design/*Fixture.tsx AND carry the marker comment. Catalogue keys passed to t() are fine.
// Usage: node scripts/check-i18n.mjs [path...]   (default: src; paths resolve against the web root)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The exemption marker for dev fixtures. Split so this file never contains it whole. */
export const FIXTURE_MARKER = 'check-i18n: ' + 'dev-fixture';

const SCANNED = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.test\.tsx?$/;
const FIXTURE_FILE = /^src\/design\/[^/]*Fixture\.tsx$/;
const LETTER = /\p{L}/u;
const ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'title',
  'alt',
  'placeholder',
  'label',
  'disabledReason',
]);

const MESSAGES = {
  'jsx-text': 'JSX text must come from the i18n catalogue',
  'literal-attribute': 'attribute text must come from the i18n catalogue',
  'document-title': 'document.title / useDocumentTitle text must come from the i18n catalogue',
  'misplaced-marker': `the "${FIXTURE_MARKER}" marker is only allowed in src/design/*Fixture.tsx`,
};

/** Path relative to the web root, with forward slashes. */
export function webPath(file) {
  const absolute = isAbsolute(file) ? file : resolve(WEB_ROOT, file);
  return relative(WEB_ROOT, absolute).split(sep).join('/');
}

function scriptKind(path) {
  if (/\.tsx$/.test(path)) return ts.ScriptKind.TSX;
  if (/\.jsx$/.test(path)) return ts.ScriptKind.JSX;
  if (/\.[cm]?ts$/.test(path)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** String literals an expression evaluates to directly (call arguments such as t('key') are not). */
function literalsIn(node) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [[node, node.text]];
  if (ts.isTemplateExpression(node)) {
    const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('');
    return [[node, text]];
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return literalsIn(node.expression);
  }
  if (ts.isJsxExpression(node)) return literalsIn(node.expression);
  if (ts.isConditionalExpression(node)) return [...literalsIn(node.whenTrue), ...literalsIn(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    const K = ts.SyntaxKind;
    if ([K.BarBarToken, K.QuestionQuestionToken, K.AmpersandAmpersandToken, K.PlusToken].includes(op)) {
      return [...literalsIn(node.left), ...literalsIn(node.right)];
    }
  }
  return [];
}

function isDocumentTitle(node) {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'title') return false;
  const target = node.expression;
  if (ts.isIdentifier(target)) return target.text === 'document';
  return ts.isPropertyAccessExpression(target) && target.name.text === 'document';
}

/** Checks one file's text; returns violations as { file, line, rule, message, match }. */
export function checkSource(file, text) {
  const path = webPath(file);
  const violations = [];
  const hasMarker = text.includes(FIXTURE_MARKER);
  const isFixture = FIXTURE_FILE.test(path);
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  const report = (index, rule, match) =>
    violations.push({ file: path, line: lineOf(index), rule, message: MESSAGES[rule], match: match.trim().slice(0, 60) });

  if (hasMarker && !isFixture) report(text.indexOf(FIXTURE_MARKER), 'misplaced-marker', FIXTURE_MARKER);
  if (TEST_FILE.test(path) || (isFixture && hasMarker)) return violations;

  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path));
  const visit = (node) => {
    if (ts.isJsxText(node) && LETTER.test(node.text)) {
      report(node.getStart(source), 'jsx-text', node.text);
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const [literal, value] of literalsIn(node)) {
        if (LETTER.test(value)) report(literal.getStart(source), 'jsx-text', value);
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useDocumentTitle'
    ) {
      for (const [literal, value] of literalsIn(node.arguments[0])) {
        if (LETTER.test(value)) report(literal.getStart(source), 'document-title', value);
      }
    } else if (ts.isJsxAttribute(node) && ATTRIBUTES.has(node.name.getText(source))) {
      for (const [literal, value] of literalsIn(node.initializer)) {
        if (LETTER.test(value)) report(literal.getStart(source), 'literal-attribute', `${node.name.getText(source)}="${value}"`);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isDocumentTitle(node.left)
    ) {
      for (const [literal, value] of literalsIn(node.right)) {
        if (LETTER.test(value)) report(literal.getStart(source), 'document-title', value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations.sort((a, b) => a.line - b.line);
}

export class MissingPathError extends Error {
  constructor(paths) {
    super(`path not found: ${paths.join(', ')}`);
    this.paths = paths;
  }
}

function listFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) return SCANNED.test(path) ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : listFiles(join(path, entry.name)),
  );
}

/** Scans files and directories (relative paths resolve against `base`, default the web root). */
export function checkPaths(paths, base = WEB_ROOT) {
  const absolutes = paths.map((path) => resolve(base, path));
  const missing = absolutes.filter((path) => !existsSync(path));
  if (missing.length > 0) throw new MissingPathError(missing);
  return absolutes
    .flatMap((absolute) => listFiles(absolute))
    .flatMap((absolute) => checkSource(absolute, readFileSync(absolute, 'utf8')));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  let violations;
  try {
    violations = args.length > 0 ? checkPaths(args, process.cwd()) : checkPaths(['src']);
  } catch (error) {
    if (!(error instanceof MissingPathError)) throw error;
    console.error(`check-i18n: ${error.message}`);
    process.exit(2);
  }
  if (violations.length === 0) {
    console.log('i18n OK');
  } else {
    for (const v of violations) console.error(`${v.file}:${v.line}: ${v.rule}: ${v.message} (${v.match})`);
    console.error(`i18n check failed: ${violations.length} violation(s)`);
    process.exit(1);
  }
}
