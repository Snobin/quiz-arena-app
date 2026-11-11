---
title: 'Story 1.3 (part 2): Malayalam font and bilingual text'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '4d97d548d0ecb5344b214e49028a60613ac87b4b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Malayalam currently renders in whatever font the phone has, and strings are a two-key placeholder. Every later screen needs a reliable self-hosted Malayalam face, the full Voice & Tone catalogue, and helpers for `lang`, numbers and titles.

**Approach:** Commit a reproducibly subset Noto Sans Malayalam woff2 with a metric-matched fallback, swap and optional faces, preload and precache. Replace the placeholder with a typed ml/en catalogue checked against the EXPERIENCE.md table, add an i18n lint, and add `<Lang>`, `formatNumber`, `useDocumentTitle` and `<html lang>` sync. A dev shaping fixture shows the hard conjuncts.

## Boundaries & Constraints

**Always:**
- Font: upstream `google/fonts` commit `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`, `ofl/notosansmalayalam/NotoSansMalayalam[wdth,wght].ttf` (sha256 `312e0e7c3cc15fa09eb42a8f749eeb246b593ed420e3c81aafe8d910c3a6fb56`). It is instanced to `wdth=100`, `wght=400:700` (still variable) and subset with pyftsubset `--unicodes=U+0D00-0D7F,U+200C-200D,U+25CC,U+0964-0965 --layout-features='*' --flavor=woff2`. A trial run gave 43 KB, just under the epic's "about 45–70 KB". That is accepted because the full script range and every layout feature are kept, so the smaller size comes from instancing, not from dropped glyphs; the shaping fixture is the proof. The output is committed to `web/public/fonts/noto-sans-malayalam-2.104.woff2`. The stable versioned name lets `index.html` preload it and the existing workbox `woff2` glob precache it.
- `@font-face` faces with the same `src` and `unicode-range`: `Noto Sans Malayalam` (`font-display: swap`) and `Noto Sans Malayalam Live` (`optional`). Plus `Noto Sans Malayalam Fallback`: `local()` Noto Sans Malayalam UI / Nirmala UI / Kartika, with `ascent-override`/`descent-override`/`line-gap-override` taken from the subset's hhea, and a measured `size-adjust`. Whether Chrome Android resolves `local()` by full font name is unproven: the shaping fixture's fallback-only row is the evidence (rendered in Noto UI = resolved; generic sans = not), and the outcome is recorded in Implementation Notes. If it does not resolve, the face stays (it still helps Windows), and the gap is noted, not hidden. A `.font-face-live` scope class swaps the family to the Live face in every token stack. `font-synthesis: none` on `html`.
- **DESIGN.md amendment:** every typography stack that names Noto Sans Malayalam gets `Noto Sans Malayalam Fallback` right after it. `tokens.ts`, `theme.css` and DESIGN.md change together, so the parity test keeps passing.
- `fontsReady(capMs = 3000)`: resolves on `document.fonts.ready` or after the cap, whichever comes first. It never rejects. Story 1.6 will use it.
- Catalogue: one typed TS source. Each entry holds `ml` and `en`, where `null` means TBD (i18next falls back to the other language) and `''` means "none by design" (EN for peak slang). It also holds `signoff` for [ASSUMPTION]/TBD languages, and per-language example params. Plurals use i18next `_one`/`_other`. Fallbacks: ml→en, en→ml. It covers every EXPERIENCE Voice & Tone row plus the shell strings: brand name, tagline, API probe text and the four tab labels. Names are interpolated, never inflected.
- i18n lint `npm run check:i18n` (TypeScript compiler API, no new dependency; wired into `npm test` like check-tokens). It fails on JSX text containing letters, and on string literals in `aria-label`, `title`, `alt`, `placeholder`, `label`, `disabledReason`, or in `document.title =`, naming file:line. It exempts tests (`*.test.ts(x)`) and only files that match `src/design/*Fixture.tsx` **and** carry the `check-i18n: dev-fixture` marker. A marker anywhere else is itself a violation.
- `<html lang>` equals the i18n language at init and on every change. `<Lang>` takes an explicit `lang`, otherwise it uses Malayalam-script detection. It renders `<span lang>` only when that language differs from the UI language.
- `formatNumber`: Latin digits with Indian grouping (`Intl.NumberFormat('en-IN', {numberingSystem:'latn'})`): `7,840`, `#3,406`, `1,00,000`. This applies in both UI languages and inside interpolation.
- `useDocumentTitle(title?)` sets `"<title> · <brand>"`, or the brand alone, in the UI language, and updates on language change. Shell and fixtures use it.

**Never:** device-language detection (Story 1.5); tab bar, routing, service worker changes beyond the existing glob, Reduce effects, live regions (part 3); a Latin web font; a second Malayalam file; new runtime dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| TBD Malayalam | `ml` UI, Share CTA | English "Beat me on Minnal" | flagged in `pendingSignoff()` |
| Language change | `en` → `ml` | `<html lang="ml">`, title and catalogue strings switch | N/A |
| Latin name in ml UI | `<Lang>Arjun K</Lang>` | `<span lang="en">Arjun K</span>` | same-language → no span |
| Hard-coded string | `<p>Hello</p>` in `src/screens/X.tsx` | `check:i18n` exits non-zero with file:line | N/A |
| Fonts slow | `document.fonts.ready` pending > 3 s | `fontsReady()` resolves at 3 s | never rejects |
| Big number | `formatNumber(100000)` | `1,00,000` | N/A |

</frozen-after-approval>

## Code Map

- `web/src/i18n.ts`: placeholder init (`ml` default, `fallbackLng: 'en'`). It becomes the init over the catalogue and keeps its import path (`main.tsx` imports it).
- `web/src/App.tsx`: `Shell` hard-codes `'API unreachable'` and `'…'`. Move these to the catalogue and add `useDocumentTitle()`. Route the dev fixture through the same `isDesignFixtureRoute` pattern for `/__shaping`.
- `web/src/design/BrandMark.tsx`: `WORDMARK` constant plus `brandLanguage()` normalisation. Read `brand.name` via `i18n.getFixedT(lang)`, and reuse `brandLanguage` for language normalisation everywhere.
- `web/src/design/tokens.ts:79-83` (`MALAYALAM`, `MALAYALAM_UI`, `UI` stacks) and the `--font-*` lines in `web/src/design/theme.css`: insert the fallback family. `tokens.test.ts` parses DESIGN.md, so amend `DESIGN.md` frontmatter lines 52–145 too.
- `web/scripts/check-tokens.mjs` + `.d.mts` + `src/design/check-tokens.test.ts`: the pattern to copy for `check-i18n` (an exported `checkSource`/`checkPaths`, a real-tree scan in the test, fixtures built by concatenation).
- `web/index.html`: add the preload `<link rel="preload" as="font" type="font/woff2" crossorigin>`.
- `web/vite.config.ts`: workbox `globPatterns` already includes `woff2`, so no change is expected. Verify the font is in `dist/sw.js`.

## Tasks & Acceptance

**Execution:**
- [x] `web/scripts/build-font.sh` -- fetch the pinned TTF, verify its sha256, instance, subset, and print the hhea metrics; output the committed woff2 -- reproducible font
- [x] `web/src/design/fonts.css` (imported by `index.css`) + `web/src/design/fonts.ts` -- the three faces, `.font-face-live`, `font-synthesis`, `fontsReady` -- loading behaviour
- [x] `DESIGN.md`, `tokens.ts`, `theme.css` -- the fallback family in the stacks -- metric-matched fallback
- [x] `web/index.html` -- preload -- first paint
- [x] `web/src/i18n/catalogue.ts`, `web/src/i18n/index.ts` (resources, fallbacks, html-lang sync, `pendingSignoff`), `web/src/i18n.ts` re-export -- the catalogue
- [x] `web/src/i18n/Lang.tsx`, `format.ts`, `useDocumentTitle.ts` -- helpers
- [x] `web/scripts/check-i18n.mjs` + `.d.mts` + `package.json` script -- the lint
- [x] `web/src/design/ShapingFixture.tsx` + `App.tsx` -- a dev-only `/__shaping` showing ക്ഷ, ന്റ, ത്ത്ര and ൺ ൻ ർ ൽ ൾ ൿ in the swap, Live and fallback-only faces, at body and question sizes
- [x] `App.tsx`, `BrandMark.tsx` -- use the catalogue
- [x] Tests: a catalogue-vs-EXPERIENCE table test that parses the Voice & Tone table and renders each entry with its example params to match the cell (with `[ASSUMPTION] ` stripped; `—`/"TBD" ↔ null/''; an assumption ↔ signoff); a failure names the Moment row, the language, and the expected vs actual text, worded as copy drift and not as a parse error; `pendingSignoff`; the matrix rows; check-i18n fixtures plus the real tree; the fonts.css face/stack test (each Noto stack has a Live counterpart)

**Acceptance Criteria:**
- Given `npm run build`, when I inspect `dist`, then the woff2 is 40–70 KB (trial: 43 KB, see Always), it is listed in `dist/sw.js`, the preload is in `dist/index.html`, and the initial JS is still ≤ 150 KB gzipped.
- Given `npm run typecheck && npm test`, when they run, then all pass, including check-tokens and check-i18n over the real tree.
- Given `/__shaping` on Chrome Android, when it renders, then the conjuncts and chillu shape correctly with no dotted circles, and the fallback-only row shows whether `local()` resolved. This is a merge gate: a Chrome Android screenshot of `/__shaping` is attached to the PR before it merges.

## Implementation Notes

- **Font build:** `web/scripts/build-font.sh` (fonttools 4.60.1 + brotli 1.1.0 in a throwaway venv; `SOURCE_DATE_EPOCH` pinned, so reruns are byte-identical). Output 42,980 bytes (sha256 `04838cafe53c96cfac03f0506a5b73b1853184ffd4f56108c3c37af71cbc078e`), name-table version 2.104. The UI sibling `ofl/notosansmalayalamui/NotoSansMalayalamUI[wdth,wght].ttf` at the same commit (sha256 `6980d9e69af585a3346e21cdaf2e20fcbd292e24db043da679ddf2bf2acb884c`) is fetched only to measure size-adjust.
- **Fallback metrics:** subset hhea ascent 864 / descent -383 / lineGap 0 at 1000 UPM. Average Malayalam advance (U+0D00-0D7F, wght 400, 110 glyphs) is 1.02812 em in both Noto Sans Malayalam and Noto Sans Malayalam UI, so `size-adjust: 100%`; the overrides (86.4% / 38.3% / 0%) correct the UI build's tighter vertical metrics. Two fallback faces (400 and 700, with Regular/Bold local names incl. PostScript names) so bold text never synthesizes. The fallback carries the same `unicode-range` so Nirmala UI / Kartika never take over Latin text.
- **local() on Chrome Android:** not yet verified (needs a device). `/__shaping` shows a status line from the FontFaceSet (`400: loaded` = resolved, `error` = not); the visual comparison alone is unreliable because Android's own `sans-serif` fallback for Malayalam is also Noto UI. Record the result here from the PR screenshot.
- **Catalogue mapping of `—` / TBD:** `''` only for English peak slang (none by design); the Malayalam `—` cells (Lobby, Join: expired/full) are `null` (TBD, fall back to English, flagged by `pendingSignoff()` as `tbd`). The shell's Malayalam "API ലഭ്യമല്ല" is new copy, marked `signoff: ['ml']`.
- **Numbers in interpolation:** i18next formats `number` and `signed` are overridden with `formatNumber` / `formatSigned`; catalogue numbers use `{{x, number}}` / `{{delta, signed}}`.
- **Typed `t()`:** `CustomTypeOptions` augmentation in `catalogue.ts` makes unknown keys a type error.
- **check-i18n:** literals are flagged only when they contain a letter, and only when the attribute/`document.title` value *is* the literal (directly or via `?:`, `||`, `??`, `&&`, `+`, templates); `t('key')` arguments are never flagged.

- Review loop 0: 8 patches applied (triage rows 1-4, 8-10, 14, 18, 21, 22), and the memlog was excluded from the commit. `fallbackLng.default` is now `ml`, so an unknown language resolves to Malayalam everywhere, matching the part 1 BrandMark rule. Story 1.5 must map non-ml device languages to `en` before it calls `changeLanguage`. Verified afterwards: typecheck passes; vitest 197/197; `check:i18n` and `check:tokens` OK; build passes with 99.5 KB gzipped initial JS; the font is listed in `dist/sw.js` and preloaded in `dist/index.html`.

## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, ECH = Edge Case Hunter, VG = Verification Gap.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | VG | Probe text's `lang="en"` (moved from `<pre>` to `<Lang>`) is unasserted | medium | `App.test.tsx` checks only `findByText('404 Not Found')`; removing `<Lang>` still passes | patch |
| 2 | VG, BH, ECH | check-i18n misses string literals as JSX expression children | medium | `literalsIn` runs only for listed attributes and `document.title`; `<p>{'Hello'}</p>` returns `[]`, and so would the old `App.tsx` ternary | patch |
| 3 | BH | Literal args to `useDocumentTitle('…')` pass the lint | medium | The hook is the sanctioned way to set titles; only a direct `document.title =` is checked | patch |
| 4 | BH, ECH | `aria-description`/`-roledescription`/`-valuetext`/`-placeholder` not checked | low | Absent from `ATTRIBUTES`; the fix is a direct addition to a set | patch |
| 5 | ECH | `document.title +=` / `document['title'] =` bypass | low | Unlikely in practice; needs new branches | reject |
| 6 | ECH | Literals in spread props objects | low | Unlikely; needs a new visitor | reject |
| 7 | ECH | `isMain` false through a symlinked path; symlink dir loops | low | Same finding was rejected in part 1 (check-tokens); `npm run` uses the real path | reject |
| 8 | BH | `fontsReady()` can resolve before the Live face is ever requested | medium | `document.fonts.ready` waits only for pending loads; with no Live-face text laid out nothing is pending, and an `optional` face that is late is never used | patch |
| 9 | BH | Catalogue test accepts `''` for a TBD cell | medium | The `none` branch allows `[null, '']`, so a blank Malayalam UI string would pass | patch |
| 10 | BH, ECH | Duplicate `moment`s overwrite each other in `byMoment` | low | Map semantics; the fix is one assertion | patch |
| 11 | BH | No check that the committed woff2 matches a fresh build; `shasum` is missing on Linux; pip without hashes | low | The script is run by hand on macOS; the reruns were byte-identical once; the fixes add plumbing | reject |
| 12 | BH | Fallback overrides come from hhea only, ignoring OS/2 | false | The subset's hhea, typo and win metrics are identical (864/−383/0 vs 864/383), measured at planning | reject |
| 13 | BH | Fallback declares only 400 and 700 while web face spans 400–700 | low | Real: the 500/600 stacks map to the nearest static fallback, so widths shift slightly on swap; a variable `local()` face is unverified on Android | reject |
| 14 | BH | Shaping fixture lacks ZWJ/ZWNJ/dot-reph samples | medium | The merge-gate screenshot can't show forms the subset claims to keep | patch |
| 15 | BH | DESIGN.md still says "about 45–70 KB" / "400 + 600 statics" | false | "About" covers 43 KB as approved; statics are the stated alternative to the variable file that ships | reject |
| 16 | BH | `dist` acceptance checks (sw.js entry, preload, 150 KB, fixture exclusion, non-root BASE_URL) not automated | medium | Verified by hand this run (sw.js 1, index.html 1, 99.5 KB, 0 fixture hits), but nothing guards regressions | defer |
| 17 | BH | Party-mode memlog in the change set | low | It sits under `_bmad-output/party-mode/` and is unrelated to the story | patch (excluded from the commit) |
| 18 | BH | `brandLanguage`/`Language` live in a UI component imported by the i18n core | low | `i18n/index.ts`, `Lang.tsx` and `catalogue.ts` import `design/BrandMark.tsx` | patch |
| 19 | BH | Brand name typed literally in catalogue copy | false | The copy is transcribed verbatim from Voice & Tone, so templating would break the table test's contract | reject |
| 20 | BH | `Lang` auto-detect accepts only a string child | low | By design: script detection needs text | reject |
| 21 | BH, ECH | `useDocumentTitle` never restores the title on unmount; a nested parent call overwrites the child | medium | Effects run child-first, so a shell-level call wins; stale title after a fixture unmounts | patch |
| 22 | ECH | `<html lang>`/`Lang`/BrandMark use `brandLanguage(i18n.language)` while strings use the resolved language | medium | `changeLanguage('ta')` gives English strings (default fallback `en`) with `lang="ml"` | patch |
| 23 | ECH | `formatSigned(-0)`, sub-0.005 and NaN rendering | low | Deltas are server integers; guards add branches | reject |
| 24 | ECH | Table parser assumes a following `## ` section and no escaped pipes | low | Neither is true of EXPERIENCE.md today | reject |
| 25 | BH | Lint exempts only `*.test.ts(x)`, not `*.spec.tsx`/setup files | low | No such files exist; `test-setup.ts` has no JSX or strings | reject |

## Design Notes

- **Why two family names:** `font-display` belongs to the face, not to the element, so the live match needs its own family name. Both faces share one URL, so the file downloads once.
- **Why `public/`:** a hashed asset URL can't be preloaded from static `index.html`. A versioned filename gives the same cache-busting.
- **size-adjust:** measure it as the ratio of the average Malayalam advance widths, Noto Sans Malayalam vs Noto Sans Malayalam UI (from the same upstream). Record the numbers in a comment.

## Verification

**Commands:**
- `cd web && npm run typecheck && npm test && npm run build` -- expected: exit 0
- `cd web && ls -l public/fonts && grep -c noto-sans-malayalam dist/sw.js dist/index.html` -- expected: woff2 present; count ≥ 1 in each

**Manual checks:**
- `npm run dev -- --host`, then open `/__shaping` on Chrome Android: correct shaping, no ◌ glyphs, and note the fallback-only row's result. Attach the screenshot to the PR (merge gate; the human owns this check).
