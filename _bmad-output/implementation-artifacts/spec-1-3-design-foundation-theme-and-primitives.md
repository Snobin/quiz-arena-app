---
title: 'Story 1.3 (part 1): Theme and accessible primitives'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'd7258a65b2fc05891bde885271feb6d3266969d9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The web shell has no visual system. Every later screen needs the DESIGN.md tokens, a live dark mode, and accessible base primitives, so that no story invents its own colours, sizes or focus styles.

**Approach:** Turn the DESIGN.md token contract into a Tailwind 4 theme plus a TS token module. Add the OS-driven dark swap, the global focus ring and the 48px hit-area utility, Button and BrandMark primitives, and a centred reflow-safe page column. A token-usage check enforces the volt and dim rules. This is part 1 of Story 1.3; the font/i18n and shell/motion/offline parts are recorded in `deferred-work.md`.

## Boundaries & Constraints

**Always:**
- Every DESIGN.md `colors`, `typography`, `rounded`, `spacing` and `motion` token exists as a CSS variable under its DESIGN name in Tailwind's `@theme`. That covers both the light and the `-dark` raw tokens, typography in rem, and the motion durations and easings. Motion tokens are also exported as TS constants. One TS source (`web/src/design/tokens.ts`) holds the values, and a test fails if CSS and TS drift apart.
- Semantic surface variables (e.g. `paper`, `card`, `ink`, `muted`, `band`) swap to their `-dark` values under `prefers-color-scheme: dark`. The swap is live, with no reload and no JS. In dark mode no white is used except as text colour.
- `:focus-visible` is a 2px solid ring with a 2px offset: `ink` (light), `ink-dark` (dark), `on-band` inside band surfaces. Never volt. No element sets `outline: none` without a replacement.
- The `hit-target` utility guarantees a ≥ 48 × 48 CSS px hit area through padding or a `::before` box, and adjacent hit areas never overlap.
- `Button` variants: `primary` (band fill — identical to ink in light, `band-dark` in dark — with on-band label; user-approved over a literal ink fill, which is 1.2:1 in dark), `secondary` (card, 1.5px ink outline), and disabled. Disabled uses `aria-disabled="true"`, stays focusable, ignores activation, and requires a `disabledReason`, shown as a caption linked with `aria-describedby`.
- `BrandMark` renders the hard-edged bolt `polygon points="7,0 1,9 5,9 3,16 11,6 7,6 9,0"` (never rounded) before the wordmark: മിന്നൽ when the i18n language is `ml`, Minnal when it is `en`. The bolt is in ink, never volt.
- Page column: no horizontal scroll at 320 CSS px, or at 360 px with 200% text. Containers use `min-height`, never fixed heights. Above 480px the column centres at `max-width: 480px`. The viewport meta never sets `maximum-scale` or `user-scalable=no`.
- Token-usage check (`npm run check:tokens`, also run by `npm test`): fail on any `dim` used as a text colour; fail on any volt utility or `var(--color-volt)` outside `web/src/design/peak/`, which is reserved for band surfaces.

**Never:** font files or the subset pipeline, i18n catalogue or lint, the tab bar or routing, the Reduce-effects store, the flash scheduler, the service worker or offline work, the bundle check (all deferred parts); any new runtime dependency besides dev tooling.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dark swap | OS switches to dark while open | surfaces use `-dark` values immediately | N/A |
| Disabled button | click / Enter on disabled Button | no `onClick`; still focusable; reason announced | N/A |
| Volt misuse | `text-volt` in a file outside `design/peak/` | `check:tokens` exits non-zero naming the file:line | N/A |
| Dim as text | `text-dim` anywhere | `check:tokens` fails | N/A |
| Language | i18n language `en` | BrandMark wordmark "Minnal" | unknown language → ml |
| Narrow / zoom | 320px, or 360px with 200% text | no horizontal scroll | N/A |

</frozen-after-approval>

## Code Map

- `web/src/index.css`: currently only `@import "tailwindcss"`. It will import the theme.
- `web/src/i18n.ts`: an existing react-i18next init with a `shell.tagline` key. BrandMark reads `i18n.language`. Do not restructure it; that's part 2.
- `web/src/App.tsx`: the placeholder shell with the API probe from Story 1.1. Keep the probe, and wrap it in the new page column.
- `web/index.html`: the viewport meta is already correct, with `lang="ml"`.
- `web/package.json`: there's no test runner yet. Add Vitest, jsdom and @testing-library/react as devDependencies.
- No design code exists yet.

## Tasks & Acceptance

**Execution:**
- [x] `web/src/design/tokens.ts`: hold every DESIGN.md token value, transcribed exactly, and export `motion` constants (in ms, plus easings).
- [x] `web/src/design/theme.css`: Tailwind 4 `@theme` with all tokens under DESIGN names, the semantic dark swap under `prefers-color-scheme: dark`, the global `:focus-visible` ring (with a band-surface variant via `.surface-band`), a `hit-target` utility, and `scroll-padding-bottom` driven by a `--fixed-bar-height` variable (default 0).
- [x] `web/src/index.css`: import the theme and apply base body styles (paper background, ink text, body typography).
- [x] `web/src/design/Button.tsx`: the primary, secondary and disabled behaviour above.
- [x] `web/src/design/BrandMark.tsx`: bolt plus wordmark by language, with an `aria-label` of the wordmark and the bolt `aria-hidden`.
- [x] `web/src/design/PageColumn.tsx`: the reflow-safe centred column.
- [x] `web/src/design/peak/README.md`: one line stating this folder is the only place volt may appear.
- [x] `web/src/design/DesignFixture.tsx` + `web/src/App.tsx`: in dev only (`import.meta.env.DEV`) at `/__design`, show swatches of every colour token, the type scale, the buttons (enabled and disabled), BrandMark in both languages and a band sample with the focus ring. Otherwise show the existing shell inside PageColumn with BrandMark.
- [x] `web/scripts/check-tokens.mjs` + `package.json` scripts `test` and `check:tokens`.
- [ ] Tests (`web/src/design/*.test.ts(x)`): CSS↔TS token parity, including that every DESIGN.md token name is present; Button disabled semantics; BrandMark language switch; check-tokens against fixture inputs (volt outside peak fails, dim text fails, a clean file passes).

**Acceptance Criteria:**
- Given the built CSS, when I list its custom properties, then every DESIGN.md colour, typography, radius, spacing and motion token is present under its DESIGN name, and typography sizes are rem.
- Given `npm run typecheck && npm test && npm run build`, when they run, then all pass, and the initial JS stays under 150 KB gzipped.
- Given the dev fixture at `/__design`, when I tab through it in light and dark, then every focusable element shows the correct ring and none is volt.

## Implementation Notes

- Primary Button uses `bg-band` (band in light = ink; band-dark in dark). The user approved this over a literal ink fill, and DESIGN.md `button-primary.background` is now `{colors.band}`.
- The full-screen win takeover keeps the light `band` value in both themes. Once swapped, no variable holds it, so the takeover story needs a fixed alias such as `--color-band-fixed`.
- Review loop 0 applied 15 patches (triage log). Verified afterwards: typecheck passes; vitest 46/46 over 5 files; `check:tokens` OK; build passes with 97.5 KB gzipped initial JS.
- Because `--spacing` is reset, only DESIGN steps compile (no `gap-0` / `p-0.5`). Under the `::before` hit-target, layouts must leave room so neighbouring 48px areas don't overlap.
- Sprint status stays `in-progress` for `1-3-design-foundation`, because parts 2 and 3 are still in `deferred-work.md`.

## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, ECH = Edge Case Hunter, VG = Verification Gap.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH, ECH | Button remounts when `disabled` toggles, so focus is lost | high | The disabled branch wraps the button in a `<span>` and the enabled branch returns it bare; React changes the element at that position | patch |
| 2 | BH, ECH | A disabled Button shifts layout because layout classes land on the inner button inside an `inline-flex items-start` wrapper | medium | `w-full` callers shrink once disabled | patch |
| 3 | BH, ECH | A disabled submit Button still allows implicit form submission, and other handlers still fire | medium | `aria-disabled` keeps it as the form's default submit button; only `onClick` is guarded | patch |
| 4 | BH, ECH | `check:tokens` misses `bg-(--color-volt)`, `text-[var(--color-dim)]`, hex literals, multi-line declarations and `colors.volt`/`colors.dim` | medium | ECH ran these inputs and got 0 violations; DesignFixture's volt hex swatch passes | patch |
| 5 | BH, ECH | `isPeakPath` depends on cwd; a missing path throws an uncaught ENOENT | low | Relative paths lose the `src/` prefix when run from `web/src`; the fix is a direct correction | patch |
| 6 | ECH | symlink cycles; unscanned extensions; realpath main detection | low | Unlikely in this repo and the fixes add branches | reject |
| 7 | BH | Default Tailwind `--text-*` and `--spacing` scales still compile (`text-sm`, `p-7`) | medium | Only `--color-*` and `--radius-*` are reset, which defeats "no story invents its own sizes" | patch |
| 8 | BH | `hit-target` uses real min-size, not padding or `::before`, and forces `inline-flex` | medium | Deviates from the frozen Always rule ("padding or a `::before` box"); the spec was clear, so this is an implementation fix | patch |
| 9 | BH | No check for `outline: none`/`outline-none` without a replacement | low | The rule is in the Always list; adding one scan pattern is direct | patch |
| 10 | BH | Body `overflow-wrap: anywhere` breaks Malayalam words mid-word | medium | `anywhere` also shrinks min-content; `break-word` keeps reflow safe | patch |
| 11 | BH, ECH | `/__design` exact match misses a trailing slash or non-root base | low | Direct correction | patch |
| 12 | ECH | No error boundary for the lazy DesignFixture | low | Dev-only, and a boundary adds a component | reject |
| 13 | BH, ECH | BrandMark: `aria-label` + `lang` may be read with the wrong voice; `en-US`/`EN` not normalised; tests reset the language only in `afterAll` | medium | Many screen readers ignore `lang` on `aria-label`; language comparison is exact | patch |
| 14 | VG | No `App` render test for `/` vs `/__design` | medium | No test imports `App` | patch |
| 15 | VG | Button default `type="button"` and the `aria-describedby` merge are not asserted | medium | The 4 Button tests don't cover them | patch |
| 16 | VG | The `on-volt` exemption in check-tokens is untested | low | Removing the skip passes every test; one assertion fixes it | patch |
| 17 | VG, BH | Built CSS, JS budget, fixture exclusion and the existence of generated utilities are never checked against `dist` | medium | The parity test reads the source `theme.css` only | defer |
| 18 | BH | `npm test` scans the tree twice | low | Script runs `check:tokens` and the test also scans the real tree; drop the script duplication | patch |
| 19 | BH | Primary button invisible inside a band surface; no hover/pressed states | low | No current caller and not required by the spec; peak stories will add a variant | reject |
| 20 | BH | DESIGN.md component tokens (`button-*`) not parity-checked; primary uses `bg-band` not `bg-ink` | — | Human approved the band fill on 2026-11-11 and the frozen wording was amended; the parity check stays low | resolved by human |
| 21 | BH, ECH | DESIGN.md path is outside `web/`; hand-rolled YAML parser; CRLF; quoted values | low | No web-only build context exists; DESIGN.md is LF and single-quoted | reject |
| 22 | ECH | Empty `disabledReason` | low | The type requires a string; a runtime guard adds a branch | reject |
| 23 | audit | Matrix rows "Dark swap" and "Narrow / zoom" lack an automated test that ran | medium | The agent covered them in headless Chrome only; jsdom can't lay out, and Playwright would be a new tool | defer |

## Design Notes

- **Raw and semantic tokens:** the raw tokens (`paper`, `paper-dark`, …) keep the DESIGN names for traceability. Components use the semantic names, which swap in dark mode, so no component writes `dark:` variants for surfaces.
- **The volt rule lives in the folder layout:** confining volt to `design/peak/` makes the rule checkable by a simple scan instead of AST analysis. Peak components arrive in later stories, inside that folder.

## Verification

**Commands:**
- `cd web && npm run typecheck && npm test && npm run build` -- expected: exit 0; the check-tokens tests pass
- `cd web && npm run check:tokens` -- expected: "token usage OK"

**Manual checks:**
- `npm run dev` → open `http://localhost:5173/__design` in Chrome. Toggle the OS dark mode: it swaps live. In DevTools at 320px, and at 360px with 200% font, there is no horizontal scroll.
