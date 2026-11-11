---
title: 'Story 1.3 (part 3): Shell, motion safety and offline'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '4f8f2dcc00fd9bd70e7dfd80034a1ddffb142842'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-quiz-arena-2026-11-11/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Minnal is one placeholder page. Later stories need a tab-bar shell with routes, a motion-safety layer (Reduce effects plus a flash budget), shared announcements, offline behaviour, and a build gate that keeps the 150 KB budget honest.

**Approach:** An in-house History-API router and a shell with the Play/Rooms/Ranks/Me tab bar. Zustand stores for Reduce effects (with auto-fallback) and live announcements. An app-wide flash scheduler. An offline banner with a play-availability hook. Manifest fixes. A post-build `check:dist` script that folds in the three related `deferred-work.md` entries. This is the last part of Story 1.3.

## Boundaries & Constraints

**Always:**
- **Router (user decision: in-house, no dependency):** `web/src/shell/router.ts` keeps the `pathname` in a store and provides `navigate(path, {replace?})`, `<Link>` (a real `<a href>`, intercepting plain left-clicks only) and `popstate` handling. It respects `BASE_URL` and matches static paths. `/__design`, `/__shaping` and `/__flash` (dev only) render outside the shell. Unknown paths render Play.
- **Shell:** the tab bar has Play `/`, Rooms `/rooms`, Ranks `/ranks`, Me `/me` (labels from the catalogue's `tab.*`). Each tab is a 20px inline-SVG icon over the tab-label type. The active tab is bold ink with `aria-current="page"`; inactive tabs are muted. It sits in a `<nav>` with a catalogue `aria-label` and is fixed at the bottom on card with a hairline top border. Every item meets `hit-target`. While visible, the bar sets `--fixed-bar-height`.
- A route can hide the bar (`useHideTabBar()`, for the live match and takeover later). Each tab restores its scroll position on return. Play keeps the existing brand, tagline and probe content. Rooms, Ranks and Me show a heading plus one line in voice. Every route calls `useDocumentTitle` once.
- **Skeleton:** rows shaped by props. The shimmer is off whenever the reduced path is active. There is no spinner component.
- **Reduce effects:** the setting is `on | off | follow-phone`, default `follow-phone`, persisted in `localStorage`; reading it never throws. The reduced path is active when the setting is `on`, or when it is `follow-phone` and `prefers-reduced-motion: reduce` (live). Session auto-fallback forces the reduced path (not persisted) when `navigator.deviceMemory ≤ 1` at boot, or when the first call to `monitorBandDrop()` sees more than 3 rAF deltas over 50 ms. The dev toggle lives on `/__design`.
- **Flash scheduler:** `requestFlash(run): cancel` keeps at most one flash start per `motion.flash-window` (1000 ms) app-wide. It is FIFO and never overlaps; a cancelled entry never runs. The dev `/__flash` QA page fires bursts through it, paints full-viewport band flashes (never volt), logs rAF timestamps, and shows the maximum number of flashes in any 1000 ms window.
- **Live regions:** a single `<LiveRegions>` in the shell renders one polite `role="status"` region and one assertive region. `announce(text, {assertive?})`: repeating identical text is announced again.
- **Offline:** `useOnline()` (`navigator.onLine` plus events). While offline an inline banner shows under the page top and is announced once per offline episode (politely). `usePlayAvailability()` returns `{disabled, reason}` for play actions. Play shows a placeholder "Quick Match" Button wired to it, disabled offline with a caption; online it does nothing yet, because Story 1.5 owns it.
- **Copy:** every new string goes in the catalogue. Drafted copy (offline banner and caption, placeholder lines, nav label, Quick Match) carries `signoff` for both languages.
- **Manifest and service worker:** add `orientation: 'any'` to the manifest. Keep `display: standalone`, the shell-only precache and the `/api`/`/ws` denylist. Prove at build time that registration is injected.
- **`npm run check:dist`** fails, naming the cause, when any of these breaks: the initial JS (the entry chunk plus its static imports) exceeds 150 KB gzipped, with the font excluded; a DESIGN.md token is missing from the built CSS as a custom property; fixture code ships; a utility used by the primitives was not generated; the woff2 is not in `sw.js` or its preload is not in `index.html`; or a `--base /sub/` build does not rebase the font URLs. It runs after `npm run build` and is wired as a `build:check` npm script that Story 1.2's CI calls.

**Never:** a router library or any new runtime dependency; Settings UI (Epic 2); real Quick Match behaviour (1.5); peak components; Playwright or browser automation (that `deferred-work.md` entry stays deferred); caching `/api` or `/ws`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tab return | scroll Ranks to 600, go to Me, back to Ranks | Ranks at 600 | N/A |
| Back button | `/` → `/rooms` → browser back | Play renders, tab active | N/A |
| Flash burst | 3 requests at t=0, 100, 200 ms | starts at 0, 1000, 2000 | cancelled request skipped |
| Follow phone | setting `follow-phone`, OS reduce on | reduced path active | storage blocked → default |
| Low memory | `deviceMemory = 1` | reduced for the session, setting unchanged | missing API → no fallback |
| Janky drop | first `monitorBandDrop` sees 4 deltas > 50 ms | reduced for the session | later drops ignored |
| Go offline | `offline` event | banner + one polite announcement; Quick Match `aria-disabled` with caption | back online → banner gone |
| Over budget | entry JS 151 KB gz | `check:dist` exits 1 naming the size | N/A |

</frozen-after-approval>

## Code Map

- `web/src/App.tsx`: fixture routing (`isFixtureRoute`) and `Shell` (brand, tagline, probe). Move the probe content into the Play screen, and replace the ad-hoc fixture check with the router (keeping the dev-only lazy imports).
- `web/src/design/PageColumn.tsx`: screens keep using it. Add bottom padding equal to `--fixed-bar-height` so content clears the bar.
- `web/src/design/theme.css`: `--fixed-bar-height` (default 0px) and `scroll-padding-bottom` already exist; `hit-target` is the 48px utility.
- `web/src/design/tokens.ts`: `motion.flashWindow` and `motion.reducedFade` (ms constants). Reuse them; don't hard-code 1000.
- `web/src/design/Button.tsx`: the disabled path (`disabledReason`) already provides `aria-disabled` plus the caption.
- `web/src/i18n/catalogue.ts`: `tab.*` exists. Add the new keys with `signoff`. `useDocumentTitle` is called once per route.
- `web/vite.config.ts`: `VitePWA` with `registerType: 'autoUpdate'`. `dist/registerSW.js` is already injected. Add `orientation`.
- `web/scripts/check-tokens.mjs`: the pattern for a Node script with an exported, tested core (copy it for `check-dist.mjs`).
- `_bmad-output/implementation-artifacts/deferred-work.md`: three entries are absorbed: the 150 KB budget check; the post-build `web/dist` check; the sw.js/preload/BASE_URL check. Do not edit them.

## Tasks & Acceptance

**Execution:**
- [x] `web/src/shell/router.ts`, `Link.tsx` -- router store, navigate, popstate, base handling -- routes
- [x] `web/src/shell/AppShell.tsx`, `TabBar.tsx`, `tabIcons.tsx`, `useHideTabBar.ts`, `scrollMemory.ts` -- the shell -- navigation
- [x] `web/src/screens/PlayScreen.tsx`, `RoomsScreen.tsx`, `RanksScreen.tsx`, `MeScreen.tsx` + `App.tsx` + `main.tsx` -- screens and wiring -- surfaces
- [x] `web/src/design/Skeleton.tsx` -- shaped rows; shimmer off when reduced -- loading
- [x] `web/src/motion/reduceEffects.ts` (store, `useReducedEffects()`, `monitorBandDrop()`), `web/src/motion/flashScheduler.ts` -- motion safety
- [x] `web/src/shell/LiveRegions.tsx` + `announce.ts` -- shared regions
- [x] `web/src/shell/online.ts`, `OfflineBanner.tsx`, `usePlayAvailability.ts` -- offline
- [x] `web/src/design/FlashFixture.tsx` (`/__flash`, dev only, with the fixture marker) + the Reduce-effects toggle on `DesignFixture.tsx` -- QA
- [x] `web/src/i18n/catalogue.ts` -- new keys
- [x] `web/vite.config.ts` -- `orientation: 'any'`
- [x] `web/scripts/check-dist.mjs` + `.d.mts` + `package.json` (`check:dist`, `build:check`) -- the dist gate
- [x] Tests: one per matrix row (the flash burst uses fake timers); router (link interception ignores modified clicks, base handling); tab bar a11y (`aria-current`, nav label, hidden route); the scheduler's FIFO and cancel; `announce` repeat; a Skeleton snapshot reduced vs not; `check-dist` core on fixture inputs (over budget, missing token, fixture leak, missing preload)

**Acceptance Criteria:**
- Given `npm run typecheck && npm test && npm run build:check`, when they run, then all pass, and `check:dist` reports the initial JS size under 150 KB.
- Given the app at 320px, and at 360px with 200% text, when I move through all four tabs, then there is no horizontal scroll and focused items are never hidden behind the tab bar (manual).
- Given `/__flash` on a throttled phone, when I fire bursts, then the maximum flashes per 1000 ms shown is 1 (manual).

## Implementation Notes

- The theme clears Tailwind's spacing scale, so zero-value spacing classes (`min-w-0`, `inset-x-0`, `bottom-0`) never generated CSS. `PageColumn`'s `min-w-0` had been dead since part 1. They are replaced with arbitrary values (`min-w-[0]`, `inset-[0]`); later stories must not use `*-0` spacing classes, and `check:dist` now catches them in `src/design`, `src/shell` and `src/screens`.
- `PageColumn` clears the tab bar with a spacer as tall as `--fixed-bar-height`, not with bottom padding. The router wiring lives in `App.tsx`; `main.tsx` needed no change. The budget counts 1 KB as 1000 bytes, matching Vite's output.
- Review loop 0 applied 16 patches (triage rows 1, 4, 6, 9, 10, 13, 15, 22, 24–28), deferred 2 (CI, hidden-tab flash backlog) and rejected 11. Known limit for the Ranks story (row 21): if a tab's content is still async when the user returns, the clamped scroll offset overwrites the saved one.
- Verified afterwards: typecheck passes; vitest 286/286 over 16 files; `check:i18n` and `check:tokens` OK; `build:check` passes with 101.8 KB gzipped initial JS and every dist check OK (including the base rebase). Manual checks are still open: 320px and 360px/200% across the tabs, offline on a phone, and `/__flash` on a throttled phone.

## Spec Change Log

## Review Triage Log

Layers: BH = Blind Hunter, ECH = Edge Case Hunter, VG = Verification Gap.

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | BH | Skeleton shimmer `@media (prefers-reduced-motion)` overrides an explicit `off` | medium | `theme.css` `@utility skeleton-shimmer` hard-codes the OS query, so the in-app setting loses | patch |
| 2 | BH | `env(safe-area-inset-bottom)` is a no-op without `viewport-fit=cover` | low | True, but this is Android-first; `viewport-fit=cover` also moves the top under the notch, which needs its own handling | reject |
| 3 | BH, VG | `build:check` is not run by any CI | medium | There is no `.github/workflows` yet; Story 1.2 owns CI | defer |
| 4 | BH, VG | Utility check skips `src/screens` | medium | `PRIMITIVE_DIRS = ['src/design', 'src/shell']`; a `min-w-0`-style class in a screen would ship ungenerated | patch |
| 5 | BH | `extractClasses` misses templates with substitutions and other helpers | low | Documented heuristic; covering more AST shapes adds branches | reject |
| 6 | BH | Route change leaves focus on the tab and gives screen readers no signal | medium | Focus stays on the `<a>`; only `document.title` changes | patch |
| 7 | BH, ECH | Offline banner adds a vertical scroll and sits outside a landmark | low | The banner sits above a `min-h-dvh` column; cosmetic while offline; axe `region` is best practice, not an AA failure | reject |
| 8 | BH | Spec records are out of step with the build (notes empty, `main.tsx` ticked) | low | A spec-record fix; Implementation Notes are filled at the end of this review | reject |
| 9 | BH | Production test imports `maxPerWindow` from a dev fixture | low | `flashScheduler.test.ts` imports `design/FlashFixture.tsx`; reusing it outside tests would leak fixture code | patch |
| 10 | BH, ECH | `/__flash` cancel/clear leaves the burst's pending timers | low | `fire()` timeouts are never stored, so the QA readout drifts | patch |
| 11 | BH, ECH | Flashes queued while the tab is hidden replay one per second on return | medium | rAF pauses, the queue does not; the right expiry depends on peak semantics | defer |
| 12 | BH | Jank monitor counts a hidden-tab pause as missed frames | false | A pause is one long delta, i.e. one missed frame; the limit is more than 3 | reject |
| 13 | BH, ECH | Two `announce()` calls on one channel in the same tick overwrite each other | medium | Each channel holds one message, so the last write wins | patch |
| 14 | BH | `announce()` is silent on routes outside the shell | low | Only dev fixtures render outside; takeovers will hide the bar inside the shell | reject |
| 15 | BH | SW deep-link fallback is not proven for `/rooms` etc. | low | Behaviour is correct (`createHandlerBoundToURL("index.html")` with the denylist is in `dist/sw.js`) but unchecked; a direct addition to `checkServiceWorker` | patch |
| 16 | BH | Base build leaves the manifest `start_url`/`scope` as `/` | low | Pages deploys at the root | reject |
| 17 | BH, ECH | Safari < 14 lacks `MediaQueryList.addEventListener`; no cross-tab `storage` sync | low | Android-first target; adds branches | reject |
| 18 | BH, ECH | check-dist fragility (single-quoted `href`, `\n}` block end, `spawnSync` with no timeout and null error, ENOENT, escaped selectors, query URLs, base `/` assumed) | low | Each is a theoretical input today; the gate still exits non-zero on a crash | reject |
| 19 | ECH | `registerSW.js` is left out of the initial-JS budget | low | About 150 bytes against a 48 KB margin | reject |
| 20 | BH | `--fixed-bar-height` is stale without `ResizeObserver`; the bold label may wrap | false | `TabBar.tsx:43` uses `ResizeObserver` when present; wrapping is covered by the 320px/200% manual check | reject |
| 21 | ECH | Restoring scroll on a still-short page records the clamped offset | low | Real only with async content; today's tab screens are static. Noted for the Ranks story | reject |
| 22 | ECH | Booting offline: the announcement lands in a just-inserted live region | medium | Regions and banner commit together; screen readers ignore the first content of a new live region | patch |
| 23 | ECH | Remounting AppShell while offline re-announces | low | Reachable only through dev fixture routes | reject |
| 24 | ECH | `<Link download>` is intercepted as navigation | low | One-line guard | patch |
| 25 | ECH | `navigate('/rooms?x=1')` or `#hash` misroutes to Play | low | The query is kept in `pathname`; the fix is a direct split | patch |
| 26 | VG | `checkDist()`/`checkBaseBuild()` composition is untested | medium | Deleting a `problems.push` line keeps the tests and the gate green | patch |
| 27 | VG | `browserEnv()` production wiring is untested | medium | Every test injects a fake env | patch |
| 28 | VG | A second offline episode is never announced in tests | low | The per-episode reset can be removed with the tests still green | patch |
| 29 | ECH | Task list ticks `main.tsx` though it is unchanged | low | Spec-record only | reject |

## Design Notes

- **Router shape:** a Zustand store `{pathname}`, updated by `navigate` and `popstate`; screens are chosen by a plain map. Params come later, and only if a story needs them.
- **"First band drop":** `monitorBandDrop()` returns `stop()`. The peak story calls it around its first band drop; this story only ships the measurement and its trigger.
- **Initial JS:** read `dist/.vite/manifest.json` (enable `build.manifest`), take the `index.html` entry chunk and walk its `imports` recursively (static only, never `dynamicImports`), then gzip each file.

## Verification

**Commands:**
- `cd web && npm run typecheck && npm test && npm run build:check` -- expected: exit 0; "initial JS … KB ≤ 150 KB"

**Manual checks:**
- `npm run dev -- --host`: tab through all four tabs at 320px and 360px/200%; toggle the phone offline (banner, disabled Quick Match); `/__flash` on the phone.
