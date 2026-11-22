---
title: 'Story 6.2: Import screen'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '0f183d0b47b37d6bc506a5617e23dab22db05920'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The custom-topic API (Story 6.1) exists but a player has no screen to use it: nowhere to paste LLM-generated JSON, see what is wrong before anything is saved, or get the private topic.

**Approach:** Add a lazily loaded Import screen at `/me/custom-topics/import`, a Custom Topics row on the Me tab (locked for guests), and a client mirror of the strict parser and validator that gives the same errors with line numbers before the server is called. The server stays authoritative. The acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 6.2" are the source of truth, including its exact strings and the GPT prompt text; this spec adds only the code decisions below.

## Boundaries & Constraints

**Always:** All new player strings live in `web/src/i18n/catalogue.ts` in both languages, with ML strings I translate flagged for sign-off, and pass `check:i18n` and `check:tokens`. The screen and its parser/validator are a lazy chunk outside the initial bundle (player bundle budget unchanged, `check:dist` passes, no admin code pulled into a player chunk). The client sends `POST /api/core/v1/me/custom-topics {name, json}` with the raw pasted text and reads `201 {customTopicId, name, questionCount, revision, usage}`, `400 errors[{item?, field, problem, fix, line?, column?}]`, `422 …/custom-topic-cap`, `413`, `429`. Server errors render through the same error list, keep the pasted text and take focus. The error list takes focus only when Import is tapped or the server returns errors, never per keystroke. Every control is at least 48px with a visible focus ring; no horizontal page scroll at 320px or at 360px with 200% text; calm screen, no volt, brick only on error text. `sessionStorage` access is wrapped in try/catch and the screen works without it.

**Never:** No backend change and no migration. No topic list, view, re-import or delete (6.3), no Practice or Battle Room wiring (6.4, 6.5): the two success actions are disabled with the caption in the story. No second source of truth for caps (read them from `GET .../usage`). No new runtime dependency. Do not edit the admin console's behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid paste | 15 valid questions, name filled | Tally "15 found · 425 / 500 after import"; Import enabled "Import · 15 questions" | N/A |
| Fenced paste | JSON inside a single ```json fence | Fence stripped; line numbers still match the pasted text | N/A |
| Syntax error | Missing comma on line 41 | One error with line, column, likely cause; caret goes to line and column on tap | Import disabled |
| Field errors | Q7 has 3 options, Q12 answer 4 | Error card "Fix 2 problems to import", rows with fix and field tag, brick gutter rule on bad lines; tapping a row scrolls, marks, focuses | Import disabled |
| More than 20 problems | 30 problems | First 20 grouped by field, "Download all problems (CSV)" with all 30 | N/A |
| Name | Empty / prefilled from `"topic"` | Prefill only while the field is unedited; empty name disables Import with "Add a topic name" | N/A |
| Over cap | Would pass 500 questions or 50 topics | Tally names the cap and overshoot; Import disabled "Over the 500-question limit" | N/A |
| 80% warning | At or over 80% after import | "!" line with headroom under the tally | N/A |
| Server rejects | 400 / 422 / 413 / 429 / network | Same error list (or note) with focus, text kept, Import usable again | Offline: Import `aria-disabled` with offline caption |
| Success | 201 | Success card, polite announcement, focus on heading, disabled actions + caption, "Import another" opens a fresh screen | N/A |
| Leave with a draft | Back, tab or close | In-app confirm for route changes, `beforeunload` for closing; draft restored from `sessionStorage` after a reload | Storage blocked: no restore |
| Guest | Me tab, or the route opened directly | Locked row; both lead to the Sign-in prompt with `returnTo` the Import route | N/A |

</frozen-after-approval>

## Code Map

- `web/src/App.tsx` -- `ROUTES` map and the prefix routers (`isTopicsPath` → `TopicsRoutes`); add an `isCustomTopicsPath` branch to a lazy `CustomTopicsRoutes` the same way; shell wraps lazy screens in `ChunkErrorBoundary` + `Suspense`
- `web/src/screens/topics/TopicsRoutes.tsx` (~line 86) -- guest redirect pattern: `signInPath(`${pathname}${search}`)` then render pending unless `status === 'registered'`
- `web/src/screens/MeScreen.tsx`, `web/src/screens/home/SignInNudge.tsx`, `web/src/screens/home/LockedModeRows.tsx` -- Me tab (guest branch shows the nudge, registered shows profile and Settings) and the Story 1.5 locked-row pattern (`mode.locked.*`, `signInPath`, `setReturnFocus`)
- `web/src/shell/router.ts` -- `navigate`, `setNavigationGuard`; `web/src/admin/useLeaveGuard.ts` and the admin `ConfirmDialog` are the leave-confirmation model (copy into `web/src/shell/` if reusing them would pull admin code into a player chunk)
- `web/src/i18n/catalogue.ts` + `scripts/check-i18n.mjs`; `useDocumentTitle(t('title.…'))` in `web/src/i18n/useDocumentTitle.ts`
- `web/src/design/Button.tsx` (aria-disabled + `disabledReason` caption), `PageColumn.tsx`; cards and tiles are class strings (`rounded-lg border border-hairline bg-card p-4`, `bg-tile`); `hit-target` / `min-h-target-min`
- `web/src/shell/announce.ts`, `online.ts` (`useOnline`), `Link.tsx`; `web/src/auth/apiFetch.ts` + `web/src/config/apiBase.ts` for the call
- `web/src/admin/UploadResult.tsx`, `web/src/admin/csv.ts` -- Story 3.3 error list and CSV download to mirror (admin strings are a separate catalogue; player strings go in the main one)
- `web/src/screens/settingsFlow.test.tsx`, `web/src/test-utils/guest.ts` -- screen-test pattern (`renderApp`, fetch stubs, `jsonResponse`)
- `web/scripts/check-dist.mjs` -- budget and chunk rules the new chunk must satisfy
- Core API (Story 6.1): `services/core/.../customtopic/api/CustomTopicController.java`; usage block `{topics, topicCap, questions, questionCap, warn}`

## Tasks & Acceptance

**Execution:**
- [x] `web/src/screens/customTopics/importParse.ts` + test -- strict recursive-descent JSON reader with line/column, single-fence strip, schema walk and validator mirror (same rules and messages as the server), problems with `item`, `field`, `fix`, `line`, `column`; parity cases against the 6.1 rules incl. Malayalam chillu and ZWJ
- [x] `web/src/screens/customTopics/importApi.ts` + test -- POST and usage GET, mapping 201/400/422/413/429/network to typed results
- [x] `web/src/screens/customTopics/` ImportScreen, PasteArea (no-wrap textarea with synchronized line-number gutter and bad-line rules), ImportErrorList (alert card, rows, >20 grouping, CSV download), Disclosures (schema and GPT prompt with Copy), SuccessCard, draft storage -- per the story's ACs
- [x] `web/src/screens/customTopics/CustomTopicsRoutes.tsx` + `web/src/App.tsx` -- lazy route, guest redirect, leave guard and `beforeunload`
- [x] `web/src/screens/MeScreen.tsx` -- Custom Topics row (registered) and locked row (guest)
- [x] `web/src/i18n/catalogue.ts` -- all strings, both languages, sign-off flags; `title.customTopicImport`
- [x] Tests -- screen flow tests for the matrix rows (Vitest). The Playwright reflow check was not added: the screen needs a signed-in session, which the backend-free e2e suite does not have; it stays a manual check and a deferred item

**Acceptance Criteria:**
- Given any local validation failure, when the player taps Import, then no request is sent and focus is on the error list.
- Given a server 400 or 422, when it returns, then the pasted text is kept and the same list shows with focus.
- Given the build, when `npm run build:check` runs, then the entry chunk is within budget and the screen is not in it.

## Implementation Notes

Implemented directly (no subagent for the build; one read-only helper mapped the web code). New folder `web/src/screens/customTopics/` (parser, API client, screen, paste area, error list, disclosures, success card, draft storage, leave dialog, chunk-local catalogue `importCatalogue.ts`, `CustomTopicsRoutes`). Own strict JSON reader because `JSON.parse` has no reliable positions. `useLeaveGuard` moved from `src/admin` to `src/shell` (only its import in `QuestionEditor.tsx` changed) so the player chunk does not pull admin code. Me tab row: Settings is a button above the profile in the current layout, so the Custom Topics row sits below the profile section (registered) and below the sign-in nudge (guest) rather than literally between Profile and Settings. Problems are worded in the UI language from codes; core's own problems are shown as it worded them (English). Initial JS 134.3 KB of 150 KB. Full-suite runs showed one intermittent failure in two new tests under heavy load (they pass alone, 4 of 4); the repo already has other load-sensitive web tests.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (not independent), by the user's earlier choice for 6.1.

| Finding | Verdict | Evidence / route |
|---|---|---|
| Ten-minute-old draft text stays in `sessionStorage` after leaving | low | session-scoped, cleared on success and on Import another; accepted |
| Restored draft announces its count once on mount | low | harmless polite announcement; accepted |
| `stripFence` regexes on a 1 MB paste | false | patterns fail fast per newline; linear |
| Server problem text could inject markup | false | rendered as React text only |
| No browser (Playwright) check of 320px / 200% text on the real screen | maybe-false | needs a signed-in session; deferred with what would settle it |
| Malayalam copy is mine | medium | every ML string is flagged for sign-off in `importCatalogue.ts`; deferred to the sign-off list |

## Verification

**Commands:**
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: all pass
- `cd web && npm run e2e` -- expected: pass
