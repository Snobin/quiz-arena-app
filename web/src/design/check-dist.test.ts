import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMIN_MARKER,
  BUDGET_BYTES,
  adminLeaks,
  adminPrecacheLeaks,
  staticAdminImports,
  PRIMITIVE_DIRS,
  WEB_ROOT,
  checkDist,
  escapeClass,
  FIXTURE_SENTINEL,
  checkBaseRebase,
  checkBudget,
  checkFont,
  checkServiceWorker,
  extractClasses,
  fixtureLeaks,
  fontUrl,
  initialJsFiles,
  missingTokens,
  missingUtilities,
  themeTokenNames,
  type Manifest,
} from '../../scripts/check-dist.mjs';
import { MALAYALAM_FONT_URL } from './fonts.ts';
import { themeVariables } from './tokens.ts';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
const FONT = MALAYALAM_FONT_URL;
/** The navigation route workbox writes into sw.js (as in the real build). */
const GOOD_SW =
  `e.precacheAndRoute([{url:"${FONT.slice(1)}",revision:"1"}]),` +
  'e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html"),{denylist:[/^\\/api\\//,/^\\/ws/]}))';

describe('check-dist: initial JS budget', () => {
  const manifest: Manifest = {
    'index.html': { file: 'assets/index.js', isEntry: true, imports: ['_vendor.js'], dynamicImports: ['src/Lazy.tsx'], css: ['assets/index.css'] },
    '_vendor.js': { file: 'assets/vendor.js', imports: ['_shared.js'] },
    '_shared.js': { file: 'assets/shared.js', imports: ['_vendor.js'] },
    'src/Lazy.tsx': { file: 'assets/lazy.js', imports: ['_heavy.js'] },
    '_heavy.js': { file: 'assets/heavy.js' },
  };

  it('walks the entry and its static imports only, never dynamic imports', () => {
    expect(initialJsFiles(manifest)).toEqual(['assets/index.js', 'assets/vendor.js', 'assets/shared.js']);
  });

  it('matrix: 151 KB of entry JS fails, naming the size', () => {
    const { problems, total } = checkBudget([{ file: 'assets/index.js', gzipBytes: 151_000 }]);
    expect(total).toBe(151_000);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^budget: initial JS 151\.0 KB gzipped exceeds 150\.0 KB/);
    expect(problems[0]).toContain('assets/index.js 151.0 KB');
  });

  it('sums the chunks, and passes at the budget', () => {
    expect(checkBudget([{ file: 'a', gzipBytes: 100_000 }, { file: 'b', gzipBytes: 50_000 }]).problems).toEqual([]);
    expect(checkBudget([{ file: 'a', gzipBytes: 100_000 }, { file: 'b', gzipBytes: 50_001 }]).problems).toHaveLength(1);
    expect(BUDGET_BYTES).toBe(150_000);
  });

  it('fails loudly on a manifest without the entry', () => {
    expect(() => initialJsFiles({})).toThrow(/index\.html/);
  });
});

describe('check-dist: tokens', () => {
  it('reads every token from theme.css, which matches tokens.ts', () => {
    const names = themeTokenNames(read('./theme.css'));
    expect(new Set(names)).toEqual(new Set(Object.keys(themeVariables())));
    expect(names).not.toContain('--spacing');
  });

  it('reports a token missing from the built CSS', () => {
    const css = ':root,:host{--color-paper:#f4f5f7;--motion-flash-window:1s}';
    expect(missingTokens(css, ['--color-paper', '--color-ink', '--motion-flash-window'])).toEqual(['--color-ink']);
  });

  it('does not take a prefix for the token (--color-ink vs --color-ink-soft)', () => {
    expect(missingTokens(':root{--color-ink-soft:#2b3040}', ['--color-ink'])).toEqual(['--color-ink']);
  });
});

describe('check-dist: fixtures', () => {
  it('reports fixture code in shipped JS or the manifest', () => {
    const js = [
      { file: 'assets/index.js', text: 'const a=1;' },
      { file: 'assets/x.js', text: `jsx("main",{"${FIXTURE_SENTINEL}":"design"})` },
    ];
    expect(fixtureLeaks(js)).toEqual([`assets/x.js carries ${FIXTURE_SENTINEL}`]);
    expect(fixtureLeaks([], { 'src/design/FlashFixture.tsx': { file: 'assets/f.js' } })).toEqual([
      'manifest lists src/design/FlashFixture.tsx',
    ]);
    expect(fixtureLeaks([{ file: 'a.js', text: 'ok' }], { 'index.html': { file: 'a.js' } })).toEqual([]);
  });

  it('every dev fixture carries the sentinel the check looks for', () => {
    const dir = join(WEB_ROOT, 'src/design');
    const fixtures = readdirSync(dir).filter((f) => /Fixture\.tsx$/.test(f));
    expect(fixtures).toEqual(expect.arrayContaining(['DesignFixture.tsx', 'FlashFixture.tsx', 'ShapingFixture.tsx']));
    for (const file of fixtures) expect(read(`./${file}`), file).toContain(`${FIXTURE_SENTINEL}=`);
  });
});

describe('check-dist: utilities', () => {
  it('extracts className literals and UPPER_CASE class constants, not other strings', () => {
    const source = `
      const BASE = 'hit-target inline-flex';
      const VARIANTS = { primary: 'bg-band text-on-band' };
      const TABS = [{ path: '/', label: 'tab.play' }];
      const lower = 'not-a-class here';
      export function X({ on }) {
        const props = rest['aria-describedby'];
        return <div className={[BASE, on ? 'font-bold' : 'text-muted', HEIGHTS[kind ?? 'text']].join(' ')} type="button">
          <span className="sr-only">{t('a.b')}</span>
        </div>;
      }`;
    expect(extractClasses('X.tsx', source).sort()).toEqual(
      ['bg-band', 'font-bold', 'hit-target', 'inline-flex', 'sr-only', 'text-muted', 'text-on-band'].sort(),
    );
  });

  it('reports a class with no generated rule, matching Tailwind escapes', () => {
    const css = '.min-w-\\[0\\]{min-width:0}.max-w-\\[480px\\]{max-width:480px}.h-\\(--fixed-bar-height\\){height:var(--fixed-bar-height)}.flex{display:flex}';
    expect(missingUtilities(css, ['min-w-[0]', 'max-w-[480px]', 'h-(--fixed-bar-height)', 'flex', 'min-w-0', 'fle'])).toEqual([
      'min-w-0',
      'fle',
    ]);
  });
});

describe('check-dist: font, service worker and base', () => {
  const relativeFont = FONT.slice(1);
  const goodHtml = `<link rel="preload" href="${FONT}" as="font" type="font/woff2" crossorigin />`;

  it('reads the font path from fonts.ts', () => {
    expect(fontUrl(read('./fonts.ts'))).toBe(FONT);
  });

  it('passes when sw.js precaches the woff2 and index.html preloads it', () => {
    expect(checkFont({ swJs: `[{url:"${relativeFont}",revision:"1"}]`, indexHtml: goodHtml, fontPath: FONT })).toEqual([]);
  });

  it('reports a missing preload', () => {
    const problems = checkFont({ swJs: `"${relativeFont}"`, indexHtml: '<link rel="icon" href="/icon.svg">', fontPath: FONT });
    expect(problems).toEqual([expect.stringMatching(/^font: index\.html has no <link rel="preload"/)]);
  });

  it('reports a woff2 missing from sw.js', () => {
    expect(checkFont({ swJs: '[]', indexHtml: goodHtml, fontPath: FONT })).toEqual([
      `font: ${relativeFont} is not precached in sw.js`,
    ]);
  });

  it('requires injected registration and the manifest fields', () => {
    const indexHtml = '<script id="vite-plugin-pwa:register-sw" src="/registerSW.js"></script>';
    const files = ['index.html', 'registerSW.js', 'sw.js'];
    const webManifest = { display: 'standalone', orientation: 'any' };
    expect(checkServiceWorker({ indexHtml, files, webManifest, swJs: GOOD_SW })).toEqual([]);
    expect(checkServiceWorker({ indexHtml: '', files: ['index.html'], webManifest: { display: 'browser' } })).toEqual([
      'sw: sw.js has no navigation fallback to index.html (createHandlerBoundToURL)',
      'sw: sw.js navigation fallback does not deny /api',
      'sw: sw.js navigation fallback does not deny /ws',
      expect.stringMatching(/registration not injected/),
      'sw: registerSW.js is missing from dist',
      'sw: sw.js is missing from dist',
      'sw: manifest display is browser, not standalone',
      'sw: manifest orientation is undefined, not any',
    ]);
  });

  it('checks a --base /sub/ build rebased the font URLs', () => {
    const base = '/sub/';
    const rebased = {
      cssFiles: [{ file: 'assets/i.css', text: `@font-face{src:url(/sub${FONT}) format("woff2")}` }],
      indexHtml: `<link rel="preload" href="/sub${FONT}" as="font" crossorigin>`,
      fontPath: FONT,
      base,
    };
    expect(checkBaseRebase(rebased)).toEqual([]);
    const broken = {
      ...rebased,
      cssFiles: [{ file: 'assets/i.css', text: `@font-face{src:url(${FONT}) format("woff2")}` }],
      indexHtml: goodHtml,
    };
    expect(checkBaseRebase(broken)).toEqual([
      `base: assets/i.css has font URL ${FONT}, not under /sub/`,
      `base: no built CSS references /sub${FONT}`,
      `base: index.html preload is not rebased to /sub${FONT}`,
    ]);
  });
});

describe('check-dist: checkDist over a dist directory', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** Every class the real primitives and screens use, as the gate collects them. */
  function realClasses(): string[] {
    const list = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? list(join(dir, e.name)) : [join(dir, e.name)],
      );
    return PRIMITIVE_DIRS.flatMap((dir) =>
      list(join(WEB_ROOT, dir))
        .filter((f) => /(?<!\.test)\.tsx$/.test(f) && !/Fixture\.tsx$/.test(f))
        .flatMap((f) => extractClasses(relative(WEB_ROOT, f), readFileSync(f, 'utf8'))),
    );
  }

  type Dist = { js: string; css: string; indexHtml: string; swJs: string };

  function goodDist(): Dist {
    const tokens = themeTokenNames(read('./theme.css'));
    const classes = [...new Set(realClasses())];
    return {
      js: 'console.log("minnal");',
      css: `:root{${tokens.map((n) => `${n}:0`).join(';')}}` + classes.map((c) => `.${escapeClass(c)}{x:0}`).join(''),
      indexHtml:
        `<link rel="preload" href="${FONT}" as="font" type="font/woff2" crossorigin>` +
        '<script id="vite-plugin-pwa:register-sw" src="/registerSW.js"></script>',
      swJs: GOOD_SW,
    };
  }

  function writeDist(dist: Dist): string {
    const dir = mkdtempSync(join(tmpdir(), 'minnal-dist-test-'));
    dirs.push(dir);
    mkdirSync(join(dir, '.vite'));
    mkdirSync(join(dir, 'assets'));
    const manifest = {
      'index.html': { file: 'assets/index.js', isEntry: true, css: ['assets/index.css'], dynamicImports: ['src/admin/AdminApp.tsx'] },
      'src/admin/AdminApp.tsx': { file: 'assets/admin.js', src: 'src/admin/AdminApp.tsx', isDynamicEntry: true },
    };
    writeFileSync(join(dir, 'assets/admin.js'), `x("${ADMIN_MARKER}")`);
    writeFileSync(join(dir, '.vite/manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, 'assets/index.js'), dist.js);
    writeFileSync(join(dir, 'assets/index.css'), dist.css);
    writeFileSync(join(dir, 'index.html'), dist.indexHtml);
    writeFileSync(join(dir, 'sw.js'), dist.swJs);
    writeFileSync(join(dir, 'registerSW.js'), '');
    writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify({ display: 'standalone', orientation: 'any' }));
    return dir;
  }

  const problemsOf = (dist: Dist) => checkDist(writeDist(dist), WEB_ROOT).problems;

  it('passes a clean dist', () => {
    const result = checkDist(writeDist(goodDist()), WEB_ROOT);
    expect(result.problems).toEqual([]);
    expect(result.initialJsBytes).toBeGreaterThan(0);
  });

  it.each<[string, (d: Dist) => Dist, RegExp]>([
    ['an oversized entry', (d) => ({ ...d, js: randomBytes(200_000).toString('base64') }), /^budget: initial JS .* exceeds 150\.0 KB/],
    ['a missing token', (d) => ({ ...d, css: d.css.replace('--color-ink:0;', '') }), /^token: --color-ink is not a custom property/],
    ['a fixture string', (d) => ({ ...d, js: `${d.js}x({"data-dev-fixture":"flash"})` }), /^fixture: assets\/index\.js carries data-dev-fixture/],
    ['a missing utility', (d) => ({ ...d, css: d.css.replaceAll('.hit-target{x:0}', '') }), /^utility: \.hit-target \(used in src\//],
    ['a missing preload', (d) => ({ ...d, indexHtml: d.indexHtml.replace(/<link[^>]*>/, '') }), /^font: index\.html has no <link rel="preload"/],
    ['a missing SW fallback', (d) => ({ ...d, swJs: d.swJs.replace('createHandlerBoundToURL', 'other') }), /^sw: sw\.js has no navigation fallback/],
  ])('reports %s by name', (_, plant, expected) => {
    const problems = problemsOf(plant(goodDist()));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => expected.test(p)), problems.join('\n')).toBe(true);
  });

  it('reports admin code in the entry chunk, by name', () => {
    const problems = problemsOf({ ...goodDist(), js: `x("${ADMIN_MARKER}")` });
    expect(problems).toEqual([expect.stringMatching(/^admin: assets\/index\.js \(initial JS\) contains admin console code/)]);
  });

  it('reports a dist without a manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'minnal-dist-test-'));
    dirs.push(dir);
    expect(checkDist(dir, WEB_ROOT).problems).toEqual([expect.stringMatching(/manifest\.json missing/)]);
  });
});

describe('check-dist: admin code stays out of the player bundle', () => {
  const adminChunk = { file: 'assets/admin.js', src: 'src/admin/AdminApp.tsx', isDynamicEntry: true };

  it('passes when the admin chunk is lazy and the entry is clean', () => {
    const manifest: Manifest = { 'index.html': { file: 'assets/index.js', isEntry: true }, 'src/admin/AdminApp.tsx': adminChunk };
    expect(adminLeaks(manifest, ['assets/index.js'], [{ file: 'assets/index.js', text: 'x' }])).toEqual([]);
  });

  it('fails when an admin module is in a statically imported chunk', () => {
    const manifest: Manifest = {
      'index.html': { file: 'assets/index.js', isEntry: true, imports: ['src/admin/Shared.ts'] },
      'src/admin/Shared.ts': { file: 'assets/shared.js', src: 'src/admin/Shared.ts' },
      'src/admin/AdminApp.tsx': adminChunk,
    };
    expect(adminLeaks(manifest, ['assets/index.js', 'assets/shared.js'], [])).toEqual([
      'admin: src/admin/Shared.ts is in the initial chunk assets/shared.js',
    ]);
  });

  it('fails when the admin chunk is not in the build', () => {
    const manifest: Manifest = { 'index.html': { file: 'assets/index.js', isEntry: true } };
    expect(adminLeaks(manifest, ['assets/index.js'], [])).toEqual([expect.stringMatching(/no lazily loaded chunk/)]);
  });

  it('flags a static import of src/admin from a player file, but not a dynamic one, a test or admin itself', () => {
    expect(staticAdminImports('src/screens/Home.tsx', "import { X } from '../admin/X.tsx';")).toEqual(['../admin/X.tsx']);
    expect(staticAdminImports('src/App.tsx', "export * from './admin/index.ts';")).toEqual(['./admin/index.ts']);
    expect(staticAdminImports('src/screens/Home.tsx', "const A = lazy(() => import('../admin/X.tsx'));")).toEqual([]);
    expect(staticAdminImports('src/screens/Home.test.tsx', "import { X } from '../admin/X.tsx';")).toEqual([]);
    expect(staticAdminImports('src/admin/Y.tsx', "import { X } from './X.tsx';")).toEqual([]);
    expect(staticAdminImports('src/screens/Home.tsx', "import { X } from './administer.ts';")).toEqual([]);
  });

  it('fails when sw.js precaches the admin chunk', () => {
    const manifest: Manifest = { 'src/admin/AdminApp.tsx': adminChunk };
    expect(adminPrecacheLeaks(manifest, 'precacheAndRoute([{url:"assets/admin.js"}])')).toEqual(['admin: sw.js precaches the admin chunk assets/admin.js']);
    expect(adminPrecacheLeaks(manifest, 'precacheAndRoute([{url:"assets/index.js"}])')).toEqual([]);
  });
});
