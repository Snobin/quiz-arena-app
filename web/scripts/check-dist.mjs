#!/usr/bin/env node
// Post-build gate over web/dist (run after `npm run build`; `npm run build:check` does both).
// Fails, naming the cause, when:
//   1. budget:        the initial JS (the index.html entry chunk plus its static imports, walked
//                     through dist/.vite/manifest.json) exceeds 150 KB gzipped. The font is not JS,
//                     so it is excluded by construction.
//   2. token:         a DESIGN.md token (every variable in theme.css's `@theme static` block, which
//                     tokens.test.ts keeps equal to tokens.ts) is not a custom property in the built CSS.
//   3. fixture:       dev fixture code ships (a `data-dev-fixture` sentinel in any JS, or a
//                     *Fixture.tsx module in the manifest).
//   4. utility:       a utility class used by the primitives (src/design and src/shell) was not
//                     generated into the built CSS.
//   5. font:          the Malayalam woff2 is not precached in sw.js, or its preload is not in index.html.
//   6. sw:            service-worker registration is not injected, sw.js lost its index.html
//                     navigation fallback or its /api, /ws denylist, or the manifest lost
//                     display: standalone / orientation: any.
//   7. base:          a `--base /sub/` build (made into a temp dir) does not rebase the font URLs.
// Usage: node scripts/check-dist.mjs [--skip-base]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';

export const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 150 KB, in kB (1000 bytes) as Vite reports sizes: the stricter reading. */
export const BUDGET_BYTES = 150 * 1000;

/** Where primitives and screens live: their class strings must all be generated. */
export const PRIMITIVE_DIRS = ['src/design', 'src/shell', 'src/screens'];

export const FIXTURE_SENTINEL = 'data-dev-' + 'fixture';

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;

// ---------------------------------------------------------------------------------------------
// 1. Initial JS budget

/** The JS files loaded up front: the index.html entry chunk and its static imports, recursively. */
export function initialJsFiles(manifest, entryKey = 'index.html') {
  const entry = manifest[entryKey];
  if (!entry) throw new Error(`manifest has no "${entryKey}" entry`);
  const files = [];
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`manifest has no chunk "${key}"`);
    if (chunk.file.endsWith('.js')) files.push(chunk.file);
    for (const imported of chunk.imports ?? []) visit(imported); // never dynamicImports
  };
  visit(entryKey);
  return files;
}

export function gzipBytes(content) {
  return gzipSync(content).length;
}

/** Sizes are { file, gzipBytes }. */
export function checkBudget(sizes, budget = BUDGET_BYTES) {
  const total = sizes.reduce((sum, s) => sum + s.gzipBytes, 0);
  const problems =
    total > budget
      ? [
          `budget: initial JS ${kb(total)} gzipped exceeds ${kb(budget)} (` +
            sizes.map((s) => `${s.file} ${kb(s.gzipBytes)}`).join(', ') +
            ')',
        ]
      : [];
  return { total, problems };
}

// ---------------------------------------------------------------------------------------------
// 2. Tokens

/** Every variable declared in the `@theme static { ... }` block (resets to `initial` excluded). */
export function themeTokenNames(themeCss) {
  const start = themeCss.indexOf('@theme static');
  if (start === -1) throw new Error('theme.css: no `@theme static` block');
  const open = themeCss.indexOf('{', start);
  const close = themeCss.indexOf('\n}', open);
  const body = themeCss.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
  // `--color-*: initial` and `--spacing: initial` are resets, not tokens.
  return [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]*);/g)].filter((m) => m[2].trim() !== 'initial').map((m) => m[1]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function missingTokens(builtCss, names) {
  return names.filter((name) => !new RegExp(`${escapeRegExp(name)}\\s*:`).test(builtCss));
}

// ---------------------------------------------------------------------------------------------
// 3. Fixtures

/** jsFiles are { file, text }. */
export function fixtureLeaks(jsFiles, manifest = {}) {
  const leaks = jsFiles.filter((f) => f.text.includes(FIXTURE_SENTINEL)).map((f) => `${f.file} carries ${FIXTURE_SENTINEL}`);
  for (const [key, chunk] of Object.entries(manifest)) {
    const src = chunk.src ?? key;
    if (/Fixture\.[jt]sx?$/.test(src)) leaks.push(`manifest lists ${src}`);
  }
  return leaks;
}

// ---------------------------------------------------------------------------------------------
// 4. Utilities used by the primitives

/** 'jsx' inside a className attribute expression, 'const' inside an UPPER_CASE const, else null. */
function classContext(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) return n.name.getText() === 'className' ? 'jsx' : null;
    if (ts.isVariableDeclaration(n)) {
      return ts.isIdentifier(n.name) && /^[A-Z][A-Z0-9_]*$/.test(n.name.text) ? 'const' : null;
    }
    if (ts.isElementAccessExpression(n) && isInside(node, n.argumentExpression)) return null;
    if (ts.isCallExpression(n) && !isJoinChain(n)) return null;
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isFunctionLike(n)) return null;
  }
  return null;
}

function isInside(node, container) {
  for (let n = node; n; n = n.parent) if (n === container) return true;
  return false;
}

/** `[...].filter(Boolean).join(' ')` and friends keep the class context. */
function isJoinChain(call) {
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee) && ['join', 'filter'].includes(callee.name.text);
}

const UTILITY = /^!?-?[a-z@][\w\-:/.[\]%#(),*]*$/;

/**
 * Class names a primitive source uses: string literals inside a `className` attribute
 * expression, or inside an UPPER_CASE const (the convention for class-string constants; there a
 * literal counts only when one of its tokens has a dash, so data such as 'tab.play' is skipped).
 */
export function extractClasses(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const classes = new Set();
  const visit = (node) => {
    const context = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? classContext(node) : null;
    if (context) {
      const tokens = node.text.split(/\s+/).filter(Boolean);
      const shaped = tokens.length > 0 && tokens.every((t) => UTILITY.test(t));
      if (shaped && (context === 'jsx' || tokens.some((t) => t.includes('-')))) for (const t of tokens) classes.add(t);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...classes];
}

/** CSS selector escape for a class name, as Tailwind writes it. */
export function escapeClass(name) {
  return name.replace(/[^\w-]/g, (c) => `\\${c}`);
}

export function missingUtilities(builtCss, classes) {
  return classes.filter((name) => !new RegExp(`\\.${escapeRegExp(escapeClass(name))}(?![\\w-])`).test(builtCss));
}

// ---------------------------------------------------------------------------------------------
// 5-7. Font, service worker, base

/** The published font path from src/design/fonts.ts (e.g. /fonts/x.woff2). */
export function fontUrl(fontsTs) {
  const match = /MALAYALAM_FONT_URL\s*=\s*'([^']+)'/.exec(fontsTs);
  if (!match) throw new Error('src/design/fonts.ts: MALAYALAM_FONT_URL not found');
  return match[1];
}

function preloads(indexHtml, href) {
  return [...indexHtml.matchAll(/<link\b[^>]*>/g)].some(
    ([tag]) => /\brel=["']?preload\b/.test(tag) && /\bas=["']?font\b/.test(tag) && tag.includes(`href="${href}"`),
  );
}

/** base is the deploy base ('/' or '/sub/'); fontPath is the root-relative published path. */
export function checkFont({ swJs, indexHtml, fontPath, base = '/' }) {
  const problems = [];
  const relativePath = fontPath.replace(/^\//, '');
  if (!swJs.includes(`"${relativePath}"`) && !swJs.includes(`'${relativePath}'`)) {
    problems.push(`font: ${relativePath} is not precached in sw.js`);
  }
  if (!preloads(indexHtml, `${base}${relativePath}`)) {
    problems.push(`font: index.html has no <link rel="preload" as="font" href="${base}${relativePath}">`);
  }
  return problems;
}

export function checkServiceWorker({ indexHtml, files, webManifest, swJs = '' }) {
  const problems = [];
  // Deep links (/rooms, /ranks, /me) open offline only through the navigation fallback.
  if (!/createHandlerBoundToURL\(\s*["']index\.html["']\s*\)/.test(swJs)) {
    problems.push('sw: sw.js has no navigation fallback to index.html (createHandlerBoundToURL)');
  }
  for (const [label, pattern] of [
    ['/api', /\/\^\\\/api\\\//],
    ['/ws', /\/\^\\\/ws/],
  ]) {
    if (!pattern.test(swJs)) problems.push(`sw: sw.js navigation fallback does not deny ${label}`);
  }
  if (!/<script\b[^>]*\bsrc="[^"]*registerSW\.js"/.test(indexHtml)) {
    problems.push('sw: index.html does not load registerSW.js (service-worker registration not injected)');
  }
  for (const required of ['registerSW.js', 'sw.js']) {
    if (!files.includes(required)) problems.push(`sw: ${required} is missing from dist`);
  }
  if (webManifest.display !== 'standalone') problems.push(`sw: manifest display is ${webManifest.display}, not standalone`);
  if (webManifest.orientation !== 'any') problems.push(`sw: manifest orientation is ${webManifest.orientation}, not any`);
  return problems;
}

/** In a build made with `base`, every font URL in the CSS and the preload carry the base. */
export function checkBaseRebase({ cssFiles, indexHtml, fontPath, base }) {
  const problems = [];
  const relativePath = fontPath.replace(/^\//, '');
  for (const { file, text } of cssFiles) {
    for (const [, url] of text.matchAll(/url\(\s*['"]?([^'")]+\.woff2)['"]?\s*\)/g)) {
      if (!url.startsWith(base)) problems.push(`base: ${file} has font URL ${url}, not under ${base}`);
    }
  }
  if (!cssFiles.some(({ text }) => text.includes(`${base}${relativePath}`))) {
    problems.push(`base: no built CSS references ${base}${relativePath}`);
  }
  if (!preloads(indexHtml, `${base}${relativePath}`)) {
    problems.push(`base: index.html preload is not rebased to ${base}${relativePath}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Reading a dist directory

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const posix = (path) => path.split(sep).join('/');

function readText(dir, pattern) {
  return listFiles(dir)
    .filter((path) => pattern.test(path))
    .map((path) => ({ file: posix(relative(dir, path)), text: readFileSync(path, 'utf8') }));
}

/** Runs checks 1-6 over a built dist directory. Returns { problems, initialJsBytes }. */
export function checkDist(distDir, webRoot = WEB_ROOT) {
  const problems = [];
  const at = (path) => join(distDir, path);
  const manifestPath = at('.vite/manifest.json');
  if (!existsSync(manifestPath)) {
    return { problems: [`dist: ${posix(relative(webRoot, manifestPath))} missing (run npm run build; build.manifest must be on)`], initialJsBytes: 0 };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const sizes = initialJsFiles(manifest).map((file) => ({ file, gzipBytes: gzipBytes(readFileSync(at(file))) }));
  const budget = checkBudget(sizes);
  problems.push(...budget.problems);

  const cssFiles = readText(distDir, /\.css$/);
  const css = cssFiles.map((f) => f.text).join('\n');
  const themeCss = readFileSync(join(webRoot, 'src/design/theme.css'), 'utf8');
  for (const name of missingTokens(css, themeTokenNames(themeCss))) {
    problems.push(`token: ${name} is not a custom property in the built CSS`);
  }

  for (const leak of fixtureLeaks(readText(distDir, /\.js$/), manifest)) problems.push(`fixture: ${leak}`);

  for (const dir of PRIMITIVE_DIRS) {
    for (const { file, text } of readText(join(webRoot, dir), /(?<!\.test)\.tsx$/)) {
      if (/Fixture\.tsx$/.test(file)) continue;
      for (const name of missingUtilities(css, extractClasses(file, text))) {
        problems.push(`utility: .${name} (used in ${dir}/${file}) was not generated`);
      }
    }
  }

  const indexHtml = readFileSync(at('index.html'), 'utf8');
  const fontPath = fontUrl(readFileSync(join(webRoot, 'src/design/fonts.ts'), 'utf8'));
  const swJs = existsSync(at('sw.js')) ? readFileSync(at('sw.js'), 'utf8') : '';
  problems.push(...checkFont({ swJs, indexHtml, fontPath }));

  const files = readdirSync(distDir);
  const webManifestPath = at('manifest.webmanifest');
  const webManifest = existsSync(webManifestPath) ? JSON.parse(readFileSync(webManifestPath, 'utf8')) : {};
  problems.push(...checkServiceWorker({ indexHtml, files, webManifest, swJs }));

  return { problems, initialJsBytes: budget.total };
}

/** Builds with `--base <base>` into a temp dir and checks the font URLs were rebased. */
export function checkBaseBuild(base = '/sub/', webRoot = WEB_ROOT) {
  const outDir = mkdtempSync(join(tmpdir(), 'minnal-base-'));
  try {
    const vite = join(webRoot, 'node_modules/vite/bin/vite.js');
    const result = spawnSync(
      process.execPath,
      [vite, 'build', '--base', base, '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
      { cwd: webRoot, encoding: 'utf8' },
    );
    if (result.status !== 0) return [`base: vite build --base ${base} failed: ${result.stderr || result.stdout}`];
    const fontPath = fontUrl(readFileSync(join(webRoot, 'src/design/fonts.ts'), 'utf8'));
    return checkBaseRebase({
      cssFiles: readText(outDir, /\.css$/),
      indexHtml: readFileSync(join(outDir, 'index.html'), 'utf8'),
      fontPath,
      base,
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const distDir = join(WEB_ROOT, 'dist');
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    console.error('check-dist: web/dist not found; run npm run build first');
    process.exit(2);
  }
  const { problems, initialJsBytes } = checkDist(distDir);
  if (!process.argv.includes('--skip-base')) problems.push(...checkBaseBuild());
  if (problems.length === 0) {
    console.log(`initial JS ${kb(initialJsBytes)} ≤ ${kb(BUDGET_BYTES)} gzipped (font excluded)`);
    console.log('dist OK: tokens, utilities, no fixtures, font precache + preload, SW registration, base rebase');
  } else {
    for (const problem of problems) console.error(`check-dist: ${problem}`);
    console.error(`dist check failed: ${problems.length} problem(s)`);
    process.exit(1);
  }
}
