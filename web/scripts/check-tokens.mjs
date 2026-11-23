#!/usr/bin/env node
// Token-usage check (DESIGN.md rules that a simple scan can enforce):
//   1. `dim` is never a text colour, and its raw value is never used outside the token files.
//   2. Volt appears only under src/design/peak/, which is reserved for band surfaces, and in the share card's
//      layout (src/share/cardLayout.ts: the card is a band surface drawn on a canvas, UX-DR3).
//   3. No `outline: none` / `outline-none` without a :focus-visible replacement.
// Patterns run over the whole file text, so multi-line declarations are caught.
// Usage: node scripts/check-tokens.mjs [path...]   (default: src and index.html; paths resolve
// against the web root, so the result does not depend on the cwd)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SCANNED = /\.(?:[cm]?[jt]sx?|css|html)$/;

/** The token definitions themselves: exempt from the volt and dim rules (not from outline). */
const TOKEN_FILES = new Set(['src/design/tokens.ts', 'src/design/theme.css']);

/**
 * Named regions exempt from the volt and dim rules, delimited by
 * `check-tokens: <name> start` / `check-tokens: <name> end` comments.
 */
const EXEMPT_REGIONS = { 'src/design/DesignFixture.tsx': 'swatch-list' };

const VARIANTS = String.raw`(?<![\w-])(?:[\w-]+:)*!?`;

const RULES = [
  {
    id: 'dim-as-text',
    message: 'dim is never a text colour',
    tokenRule: true,
    patterns: [
      new RegExp(String.raw`${VARIANTS}text-dim(?:-dark)?(?:\/[\w.]+)?(?![\w-])`, 'g'),
      new RegExp(String.raw`${VARIANTS}text-[\[(]\s*(?:color:\s*)?(?:var\(\s*)?--color-dim(?:-dark)?(?![\w-])`, 'g'),
      /(?<![\w-])color\s*:\s*['"`]?\s*var\(\s*--color-dim(?:-dark)?(?![\w-])/g,
    ],
  },
  {
    id: 'dim-raw-value',
    message: 'use the dim token through CSS classes, not its raw value or the TS object',
    tokenRule: true,
    patterns: [
      /#9AA0AA(?![0-9a-f])/gi,
      /\bcolors\s*(?:\.\s*dim\b|\[\s*['"`]dim(?:-dark)?['"`]\s*\])/g,
    ],
  },
  {
    id: 'volt-outside-peak',
    message: 'volt may appear only in src/design/peak/ (band surfaces)',
    tokenRule: true,
    peakAllowed: true,
    patterns: [
      // Any utility ending in -volt (bg-volt, text-volt, hover:border-volt/50, ...), but not on-volt.
      new RegExp(String.raw`${VARIANTS}(?:[a-z0-9]+-)+volt(?:\/[\w.]+)?(?![\w-])`, 'g'),
      // Any reference to the variable: var(--color-volt), bg-(--color-volt), theme(--color-volt).
      /--color-volt(?![\w-])/g,
      /#D4FF2A(?![0-9a-f])/gi,
      /\bcolors\s*(?:\.\s*volt\b|\[\s*['"`]volt['"`]\s*\])/g,
    ],
    skip: (match) => /(?:^|[-:])on-volt(?:\/[\w.]+)?$/.test(match),
  },
  {
    id: 'outline-none',
    message: 'outline: none needs a :focus-visible replacement on the same element or rule',
    patterns: [new RegExp(String.raw`${VARIANTS}outline-none(?![\w-])`, 'g'), /(?<![\w-])outline\s*:\s*['"`]?none\b/g],
    allowed: hasFocusReplacement,
  },
];

/** Path relative to the web root, with forward slashes. */
export function webPath(file) {
  const absolute = isAbsolute(file) ? file : resolve(WEB_ROOT, file);
  return relative(WEB_ROOT, absolute).split(sep).join('/');
}

/** True when the file lives under src/design/peak/ (resolved against the web root). */
export function isPeakPath(file) {
  const path = webPath(file);
  return path.startsWith('src/design/peak/') || path === 'src/share/cardLayout.ts';
}

function exemptRanges(path, text) {
  const name = EXEMPT_REGIONS[path];
  if (!name) return [];
  const ranges = [];
  const start = `check-tokens: ${name} start`;
  const end = `check-tokens: ${name} end`;
  let from = text.indexOf(start);
  while (from !== -1) {
    const to = text.indexOf(end, from);
    if (to === -1) break;
    ranges.push([from, to]);
    from = text.indexOf(start, to);
  }
  return ranges;
}

/** Utility: the enclosing string literal must also set a focus-visible outline or ring. */
function enclosingString(text, index) {
  let best = -1;
  let quote = '';
  for (const q of ['"', "'", '`']) {
    const at = text.lastIndexOf(q, index);
    if (at > best) [best, quote] = [at, q];
  }
  const end = best === -1 ? -1 : text.indexOf(quote, index);
  if (best === -1 || end === -1) {
    const lineStart = text.lastIndexOf('\n', index) + 1;
    const lineEnd = text.indexOf('\n', index);
    return text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  }
  return text.slice(best + 1, end);
}

/** CSS: the rule's selectors must each have a `:focus-visible` rule setting a visible outline or shadow. */
function enclosingRule(text, index) {
  const open = text.lastIndexOf('{', index);
  if (open === -1) return null;
  const selectorStart = Math.max(text.lastIndexOf('}', open), text.lastIndexOf('{', open - 1), text.lastIndexOf(';', open)) + 1;
  return text.slice(selectorStart, open).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasFocusReplacement(text, index, match) {
  if (/outline-none$/.test(match)) {
    return /(?<![\w-])focus-visible:(?:outline|ring)(?![\w])/.test(enclosingString(text, index));
  }
  const selector = enclosingRule(text, index);
  if (!selector || selector.includes(':focus-visible')) return false;
  return selector.split(',').every((part) => {
    const replacement = new RegExp(String.raw`${escapeRegExp(part.trim())}:focus-visible\s*\{([^}]*)\}`);
    const body = replacement.exec(text)?.[1] ?? '';
    return /(?:^|[;\s])(?:outline(?:-style)?\s*:\s*(?!none)|box-shadow\s*:)/.test(body);
  });
}

/** Checks one file's text; returns violations as { file, line, rule, message, match }. */
export function checkSource(file, text) {
  const path = webPath(file);
  const tokenFile = TOKEN_FILES.has(path);
  const ranges = exemptRanges(path, text);
  const inExemptRange = (index) => ranges.some(([from, to]) => index >= from && index < to);
  const violations = [];
  for (const rule of RULES) {
    if (rule.tokenRule && tokenFile) continue;
    if (rule.peakAllowed && isPeakPath(path)) continue;
    for (const pattern of rule.patterns) {
      for (const found of text.matchAll(pattern)) {
        const index = found.index;
        if (rule.tokenRule && inExemptRange(index)) continue;
        if (rule.skip?.(found[0])) continue;
        if (rule.allowed?.(text, index, found[0])) continue;
        const line = text.slice(0, index).split('\n').length;
        violations.push({ file: path, line, rule: rule.id, message: rule.message, match: found[0] });
      }
    }
  }
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
    violations = args.length > 0 ? checkPaths(args, process.cwd()) : checkPaths(['src', 'index.html']);
  } catch (error) {
    if (!(error instanceof MissingPathError)) throw error;
    console.error(`check-tokens: ${error.message}`);
    process.exit(2);
  }
  if (violations.length === 0) {
    console.log('token usage OK');
  } else {
    for (const v of violations) console.error(`${v.file}:${v.line}: ${v.rule}: ${v.message} (${v.match})`);
    console.error(`token usage check failed: ${violations.length} violation(s)`);
    process.exit(1);
  }
}
