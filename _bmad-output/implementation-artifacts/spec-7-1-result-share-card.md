---
title: 'Story 7.1: Result share card'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: '6392bf8b79106fe4f8c4bcc346ea6298fe887bef'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A player who has just finished a match has no way to show the result or pull friends in: the results action bars have an empty Share slot, there is no share image, and a shared link has nowhere to land.

**Approach:** Add a Share action to every results screen that draws a 1080 × 1080 result card on a canvas in the browser (renderer in a lazy chunk, no server), shares it with the OS sheet or falls back to a download plus a copied link, and add the `/q` route that drops anyone straight into Quick Match matchmaking. The acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 7.1" are the source of truth, including every exact string and size; this spec adds the code decisions below.

## Boundaries & Constraints

**Always:** The renderer and its text builders load only when Share is tapped (lazy chunk); the initial bundle stays within budget and the results chunk grows by the button only. Everything on the card comes from the stored `MATCH_ENDED`, in the sharer's UI language, names unchanged. The card has no photo, avatar, district, rating number or user id; volt appears only on the ink field; no text under 40 px on the 1080 canvas; text that does not fit shrinks to 40 px, then is cut with an ellipsis. The link is `publicOrigin()` + `/q` (via `withBase`), shown without the scheme, with no query, id or tracking. A custom-topic room's card says only "Battle Room". The font is awaited with `document.fonts.load` or 3 s, whichever comes first.

**Never:** No server call, third-party service or server rendering. No direct-challenge behaviour: `/q` never pairs her with the sharer. No Share on an aborted match or on the minimal fallback view (no `MATCH_ENDED`). No change to results content, ratings or the existing action buttons beyond making room for Share.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Share shown | Full results view, guest or registered, live or rehydrated, 1v1, Topic Duel, room | Secondary "Share" in the bar: Rematch / Home / Share (2fr / 1fr / 1fr), room host Play again / Home / Share, other room players Home / Share (plus the join button when it arrives), stacked when labels do not fit | offline: `aria-disabled` with the offline caption |
| Result lines | `MATCH_ENDED` | 1v1 win "Anju beat Vishnu", loss "Vishnu won · Anju 7,420", draw "Anju drew with Vishnu"; room sole #1 "Anju won · 23 players", joint win "Anju · joint win · 23 players", else "Anju came #3 of 23"; bot opponent named "Minnal Bot"; Malayalam "<name> · ജയിച്ചു" pattern | N/A |
| Mode line | Source and mode | "Quick Match", "Topic Duel · <topic>", "Battle Room · <topic>" (bank); custom room: "Battle Room" only | N/A |
| Tap Share | Online | Button shows "…" and ignores taps; PNG blob from a 1080 canvas; `navigator.canShare({files})` true: `navigator.share({files, text, url})` | `AbortError`: nothing shown |
| No file sharing | Desktop, in-app browser | Download `minnal-result.png`, copy text plus link, note "Image saved · link copied" announced politely once | clipboard refused: the note shows the link as selectable text |
| Share text | Win | "I beat Vishnu 7,840 – 7,420 on Minnal. Beat me:" in the UI language, matching the result line | N/A |
| Open `/q` | New, returning or signed-in, any token state | Guest token obtained when none, Quick Match join at once, matchmaking screen, Cancel to Home | profile not set up: setup first, then matchmaking; already in a queue, room or match: the `ALREADY_IN_MATCH` offer; offline: Home with the offline banner; draining: the "try again" notice |
| Narrow screen | 320 px at 100%, 360 px at 200% text | Every button keeps a 48 px hit area and a visible focus ring, labels wrap, no truncation | N/A |

</frozen-after-approval>

## Code Map

- `web/src/screens/results/ResultsScreen.tsx` -- `ActionBar` (flex row, `[&>*]:flex-1`), `RematchActions`, `RoomActions` → `HostActions` and `PlayerActions`, `PlayAgainActions` (signed in after a guest match); each gains the Share button; `resultView` in `outcome.ts` gives win, loss, draw, rival and winner; the minimal view has no `MATCH_ENDED` and gets no Share
- `web/src/design/BrandMark.tsx` -- the bolt polygon (`7,0 1,9 5,9 3,16 11,6 7,6 9,0`) and the wordmark by language; `web/src/design/fonts.css` -- face name `Noto Sans Malayalam`; DESIGN `share-card`: band `#101216`, band-raised `#2B3040`, volt `#D4FF2A`, 1080 px, radius 18 px
- `web/src/screens/rooms/share.ts` -- `shareRoom`, `copyText`, `selectContents`: the share-sheet and clipboard helpers to reuse (the file-share branch is new); `web/src/config/publicOrigin.ts` -- `publicOrigin()`, `withBase`
- New `web/src/share/` (lazy chunk): pure `cardLayout.ts` (text, sizes, positions and colours as draw operations, given a text measurer), `cardText.ts` (result line, mode line, share text), `drawCard.ts` (executes the operations on a canvas, `toBlob`), `shareResult.ts` (fonts, render, share or download and copy); `shareCatalogue.ts` (strings, ML flagged `signoff`) imported by the button
- `web/src/App.tsx` -- `ROUTES` and the lazy route pattern; add `/q` as a tiny lazy route that sends a registered player with an incomplete profile through setup (the existing `to` mechanism) and everyone else to `/matchmaking` (which joins Quick Match on mount, as Home's button does); offline goes to `/`
- `web/src/shell/online.ts`, `announce.ts`, `Button.tsx` (`disabledReason` caption) -- offline caption and the polite note
- `web/scripts/check-dist.mjs` -- budget and chunk rules (the renderer must not be in the entry chunk)

## Tasks & Acceptance

**Execution:**
- [x] `web/src/share/cardText.ts` and `shareCatalogue.ts` -- result, mode and share-text builders in both languages, names unchanged, custom rooms generic
- [x] `web/src/share/cardLayout.ts` and `drawCard.ts` -- the 1080 card as draw operations and the canvas executor; fit-or-shrink to 40 px; volt only on the field
- [x] `web/src/share/shareResult.ts` -- font wait, PNG blob, file share, download and clipboard fallback, abort handling
- [x] `web/src/screens/results/ShareButton.tsx` and `ResultsScreen.tsx` -- Share in every full-view bar, "…" while rendering, offline caption, polite note
- [x] `/q` route in `App.tsx` plus a tiny lazy component -- guest token, setup first, matchmaking, offline and draining paths
- [x] Tests -- text and layout goldens for win, loss, draw, room #1, joint win, #7 of 23 and a custom room, each in both languages; layout invariants (no text under 40 px, volt only in allowed operations, no custom topic name); the share and fallback flows with a fake canvas and `navigator`; `/q` flows; button placement per results screen

**Acceptance Criteria:**
- Given a custom-topic room result, when the card is built, then the topic name appears nowhere in its text, share text or link.
- Given any shared link, when it is built, then it contains no query string, user id, match id or name.
- Given the build, when `npm run build:check` runs, then the renderer is not in the entry chunk and the initial JS stays within 150 KB.

## Implementation Notes

Implemented directly (no subagent). New `web/src/share/`: `shareCatalogue.ts` (strings, ML flagged `signoff`), `cardText.ts` (result, mode and share text, link), `cardLayout.ts` (pure draw operations with `fit`, 40 px floor), `drawCard.ts` (`paint` loop and `renderCard`), `shareResult.ts` (font wait, file share, download plus clipboard fallback, abort), plus `cardFixtures.ts` for the seven epic cases. `screens/results/ShareButton.tsx` exports `useShareCard`, which `ResultsScreen` creates once and threads into `RematchActions`, `RoomActions` (host and player bars) and `PlayAgainActions`; the 1v1 and host primary buttons get `flexGrow: 2` for the 2fr / 1fr / 1fr row. `/q` is a tiny lazy route (`screens/ShareLink.tsx`) that waits for the session, then replaces itself with `/matchmaking` (offline: `/`); the shell's existing setup redirect covers a registered player with an unfinished profile. `check-tokens.mjs` now allows volt in `src/share/cardLayout.ts` (the card is a band surface, UX-DR3). Initial JS 134.9 KB (was 134.5); the renderer and its strings are separate chunks. Existing results tests that asserted "Home only" or a two-button bar now expect Share.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| Golden tests are layout and text goldens, not pixel goldens | medium | accepted and disclosed in Design Notes; the real PNG (shaping, thumbnail legibility, under 1 s on a low-end phone) is a manual check on a device |
| The registered-player-with-unfinished-profile path of `/q` has no dedicated test | low | relies on the shell's existing `needsSetup` redirect with `to=/q`; covered by the setup tests for other routes |
| 320 px and 200% text button layout is not measured in a browser | low | the bar already wraps (`flex-wrap`); needs the manual playtest and the 7.4 checklist |
| Share text for loss, draw and room results is not in the epic | low | follows the win pattern; flagged `signoff` with the Malayalam |
| `check-tokens` volt allowance widened to `src/share/cardLayout.ts` | low | the share card is an explicit volt surface in DESIGN; one named file only |
| Canvas `roundRect` needs a recent browser | low | supported in current Chrome, Safari and Firefox; an older one fails to `failed` and shows the note |

## Design Notes

jsdom has no canvas, so the golden tests assert the draw operations (text, size, position, colour) and the text builders, not pixels; the canvas executor is a thin loop over those operations, checked with a recording fake context. A real-device check of the rendered PNG (shaping, thumbnail legibility, under 1 s on a low-end phone) is a manual verification step.

The epic gives the share text only for a win; the loss, draw and room texts follow the same pattern and are flagged for sign-off with the Malayalam.

## Verification

**Commands:**
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check && npm run e2e` -- expected: all pass

**Manual checks:**
- On a real Android phone: Share from a 1v1, a Topic Duel and a room result opens the sheet with the image, line and link; the Malayalam card shapes correctly and reads at WhatsApp thumbnail size; tapping the link from WhatsApp lands in matchmaking.
