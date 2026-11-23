---
title: 'Story 7.2: Install prompt'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: '0f8705a'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Minnal has a manifest and service worker but only an SVG icon (not installable on Android Chrome), nothing checks installability in CI, and a registered player who has just finished her first match is never offered a home-screen install.

**Approach:** Add 192/512/maskable PNG icons and a CI installability check; capture `beforeinstallprompt` at boot; show one quiet inline install card on a registered player's results (once per user per device, state in `localStorage`). The acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 7.2" are the source of truth, including every exact string; this spec adds the code decisions below.

## Boundaries & Constraints

**Always:** The card is inline on the full results view, below the band (or podium and standings) and above the breakdown; never a modal, never over the action bar, no volt, Sign-in nudge styling. The `beforeinstallprompt` listener is registered at boot (initial bundle, at most 2 KB gzipped added); the card and its strings load with the results chunk. State is `install:{userId}` = `{firstMatchSeen, state: PENDING | DISMISSED | INSTALLED}`; a failing storage read counts as DISMISSED. Both buttons keep 48 px hit areas and visible focus rings; text wraps at 320 px and 200% text.

**Never:** No card for a guest, a guest-played match, a standalone launch, a DISMISSED or INSTALLED state, or any browser with neither an install event nor iOS Safari (Firefox, in-app browsers). No card on the minimal view or aborted matches. Never show the browser's own mini-infobar. Never cache `/api/**` or `/ws`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Install event | Registered, PENDING or new, event kept | Card with benefit text, Install, Not now | N/A |
| Event not yet fired | Same, no event | No card; stays eligible for her next results | N/A |
| Tap Install | Event kept | `prompt()`; accepted: card gone, INSTALLED, "Minnal installed" announced; dismissed: card gone, DISMISSED | `prompt()` throws: treated as dismissed |
| `appinstalled` | Fires at any time | INSTALLED for the signed-in user, card gone | N/A |
| Not now | Any variant | Card gone with no animation, DISMISSED, focus to next control in reading order | write fails: card still goes this visit |
| iOS Safari | Not standalone, no event | "Tap Share, then Add to Home Screen" and "Got it" (DISMISSED) | N/A |
| Hidden | Guest, standalone, DISMISSED, INSTALLED, storage read throws | No card | N/A |

</frozen-after-approval>

## Code Map

- `web/vite.config.ts` -- manifest has one SVG icon; add `pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png` (public, drawn from `public/icon.svg`: ink rounded square, volt bolt; maskable is full-bleed, bolt already inside the safe circle).
- `web/scripts/check-dist.mjs` (`checkServiceWorker`, `checkDist`) and `web/src/design/check-dist.test.ts` -- extend with manifest fields (name, short_name, scope, start_url in scope, theme and background colours, PNG icons 192 and 512 incl. maskable, files present in dist), and a `fetch` listener in sw.js. No Lighthouse (the PWA category no longer exists); recorded as an assumption.
- New `web/src/install/installPrompt.ts` (initial bundle) -- captures the event and `appinstalled`, standalone and iOS Safari detection, `useInstallOffer`, per-user state read and write.
- `web/src/main.tsx` -- imports `installPrompt.ts` so the listener is live before any results.
- New `web/src/screens/results/InstallCard.tsx` and `installCatalogue.ts` (ML flagged `signoff`, typed via `InstallKey` in `i18n/catalogue.ts`) -- the card; `ResultsScreen.tsx` `FullResults` renders it after the room block and guest prompt, when `!takeover`, `status === 'registered'` and `!playedAsGuest`.
- Reuse `session.userId()`, `announce`, `Button`, the Sign-in nudge classes (`rounded-lg border-[1.5px] border-ink bg-card p-4`).

## Tasks & Acceptance

**Execution:**
- [x] PNG icons, manifest and `check-dist` installability rules plus tests
- [x] `install/installPrompt.ts` and `main.tsx` import; unit tests (event capture, state, standalone, iOS, storage failure)
- [x] `InstallCard.tsx`, `installCatalogue.ts`, `ResultsScreen.tsx` wiring; component tests for every matrix row

**Acceptance Criteria:**
- Given the build, when `npm run build:check` runs, then it fails if any installability rule above is broken, and initial JS grows by at most 2 KB gzipped.
- Given each hidden case in the matrix, when results render, then no card shows.

## Implementation Notes

Implemented directly (no subagent). PNG icons drawn with Pillow from the SVG geometry (the maskable one is full-bleed; the bolt already sits inside the safe circle) and declared in `vite.config.ts`. `check-dist.mjs` gains `checkInstallability` (manifest fields, start_url within scope, 192/512/maskable PNG icons present with real IHDR sizes) and a fetch-handler check that also reads workbox's runtime file, where the listener actually lives. `install/installPrompt.ts` (imported by `main.tsx`) keeps the event and `appinstalled`, detects standalone and iOS Safari, and owns the `install:{userId}` state; `InstallCard.tsx` renders it between the band/podium and the breakdown, only after the takeover collapses, for a registered player who played as a registered player. Initial JS 135.4 KB (was 134.9, so +0.5 KB). Strings are in a results-chunk catalogue (`installCatalogue.ts`, ML flagged `signoff`). No Lighthouse run (its PWA category no longer exists). The real Android Chrome install is not done here; it belongs on the 7.4 checklist. `npm run e2e` was not run.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| Tapping Install clears the kept event at once, so the card hides while the browser dialog is open | low | the event is single-use; the card is removed on the outcome anyway |
| First-match record is written even when no card can show | low | intended: the matrix keeps her eligible and records the first match |
| Real-device install, 320 px and 200% text layout not measured in a browser | medium | manual check, listed for the 7.4 checklist |
| `npm run e2e` not run | low | unit, build and dist checks pass; e2e needs browsers |

## Design Notes

Real-device install on Android Chrome cannot be done here; it is a manual step for the 7.4 checklist.
