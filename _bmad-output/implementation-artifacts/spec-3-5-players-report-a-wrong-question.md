---
title: 'Story 3.5: Players report a wrong question'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: '009c64c864d9dc1200a2fb7c38d43935f11ae327'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A registered player who spots a wrong question has no way to tell Snobin. The reveal and results screens have no report link, and core has no place to store reports or a player-facing endpoint.

**Approach:** Build Story 3.5 exactly as its criteria in `epics.md` (section "Story 3.5: Players report a wrong question") describe: a V8 `question_report` migration, `POST /api/core/v1/questions/{questionId}/versions/{version}/reports` for registered players with the shared rate limiter, and a shared report link and note component on the live reveal and results breakdown, with the two-step live-reveal flow.

## Boundaries & Constraints

**Always:** Only a `USER` token reports (`403` for a guest, `401` without a token). The version must exist as a `PUBLISHED` bank version (`404` otherwise, nothing stored); a second `OPEN` report by the same player on the same version is `409`. Note is optional, NFC, trimmed, at most 500 characters. Limit is capacity 5, refilling 1 per 2 minutes, `429` with `Retry-After`. The link never shows before the reveal, for a guest, or when `questionSource` is `CUSTOM`. The report link and note field are one shared component. Initial player JS stays at most 150 KB gzipped (about 3.5 KB of headroom today): load the note sheet lazily, and only if that is not enough lazy-load other non-first-view routes. New Malayalam copy is flagged `signoff`. No attribution lines in commits, PRs or code.

**Never:** No change to the admin API or its architecture rule. No match data checked in core. No typing during live play and no pause of the match. No edit to existing `check-dist` rules or `BUDGET_BYTES`.

**Decision:** the request body keeps the epic's `matchId` field. `NoGuestResultEndpointTest` forbids body fields containing "match", so add one narrow, commented exception for this endpoint (it is registered-only), instead of renaming the field.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| Report | USER token, published bank version | `201 {reportId}`, stored `OPEN` | n/a |
| Not reportable | unknown, draft, discarded version or custom-topic id | nothing stored | `404` |
| Guest or no token | GUEST / none | nothing stored | `403` / `401` |
| Long note | over 500 characters | nothing stored | `400` with field error |
| Repeat | `OPEN` report exists | nothing stored | `409`; UI says "You've already reported this question"; allowed again once closed |
| Rate limit | 6th report in the window | nothing stored | `429` with `Retry-After`; UI keeps the typed note |
| Results report | tap on a breakdown row | inline note field, correct row expands first, `surface: RESULTS` with `matchId` | failed request keeps note, inline error with Retry |
| Live reveal tap | tap during the 2 s reveal | match not paused; "Marked · add a note on results"; mark kept in `sessionStorage` with the stored `MATCH_ENDED` | nothing sent unless she submits |
| Results after a mark | marked question | its row opens expanded with the note field ready, `surface: LIVE_REVEAL` | n/a |
| Offline | no connection | "Send report" `aria-disabled` with the offline caption | n/a |
| Success | `201` | note field replaced by the thanks line, announced politely, link gone for that question | n/a |

</frozen-after-approval>

## Code Map

- core `db/migration/V8__question_report.sql` -- only `question_report`, with a composite FK `(question_id, version)` to `question_version`, partial unique `(reporter_id, question_id, version) WHERE status='OPEN'`. Update `MigrationIntegrationTest` (exact table list, between `question_version` and `refresh_token`) and `PostgresIntegrationTest` TRUNCATE (same statement as `question_version`).
- core `platform/infrastructure/ratelimit/RateLimitPolicy.java` -- add `QUESTION_REPORT` (`question-report`, 5, 1, 2 minutes). Copy `AdminUploadController` order: auth, then `tryAcquire`, refusal as `429`.
- core new `question/api/QuestionReportController.java` (not under `api/admin`), `BearerAuthenticator.requireRegistered`, its own nested `@RestControllerAdvice` like `MeController.Errors` (do not add it to `AdminExceptionHandler`) with `errors[]`, `Retry-After`, `urn:minnal:problem:{status}`. Service checks the version is `PUBLISHED`; custom-topic ids are not in the bank, so they `404`.
- core `NoGuestResultEndpointTest` -- add the path to `PUBLIC_API` and the narrow `matchId` exception.
- web `screens/match/RevealDetails.tsx` (attribution row, shared with `BreakdownRow`; keep it unchanged, render the report affordance next to it), `LiveMatchScreen.tsx` (~464, `reveal` has `questionId`, `version`), `screens/results/BreakdownRow.tsx` (`Details()` ~68-100; correct rows start collapsed), `ResultsScreen.tsx`, `realtime/protocol.ts` (`MatchEndedPayload.questionSource`; `ResultQuestion` has none), `realtime/lastResult.ts` (`sessionStorage` `minnal.lastResult`, try/catch).
- web patterns: `useSession` for registered, `apiFetch`, `shell/online.ts` `useOnline`, `catalogue.offline.playCaption`, `hit-target min-h-target-min`, `shell/announce.ts`, `Button` `aria-disabled`; `i18n/catalogue.ts` (`signoff`); new `lazy()` note sheet (pattern `AdminRoute.tsx`).

## Tasks & Acceptance

**Execution:**
- [x] core V8 migration, `QUESTION_REPORT` policy, report service and controller, Problem Details advice, closed-list and migration test updates
- [x] core integration tests for the matrix (201, 403, 401, 404 for each kind, 400, 409 then allowed after close, 429 with `Retry-After`)
- [x] web shared report link and lazy note sheet (label, live count to 500, errors with `aria-describedby`, focus moves, thanks line, 409/429/5xx/offline states)
- [x] web live-reveal mark (`sessionStorage`, "Marked · add a note on results", announced) and results integration (expand the correct row, `surface`, `matchId`, `CUSTOM` and guest hide the link)
- [x] web tests, catalogue entries (ml and en, `signoff`), `build:check` within 150 KB

**Acceptance Criteria:**
- Given the epic's Story 3.5 criteria, when core and web ship, then each Given/When/Then there holds and the player bundle stays within budget.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| After a successful report the link returns when a correct breakdown row is collapsed and re-expanded, and an unsent note is lost | medium | patch | `settled` is local state in `ReportQuestion`, and `Details` unmounts on collapse; the epic says the link no longer shows on this screen |
| Marks are never removed after a send, so a reload reopens the row and the next send gets `409` | medium | patch | `lastResult.clear()` is the only remover |
| Every 400 shows "at most 500 characters" | medium | patch | `NoteSheet` maps 400 to `tooLong` without reading `errors[].field` |
| Double click on Send can fire two POSTs; Cancel is live while sending | low | patch | state read from a stale closure; cheap ref guard |
| `NoGuestResultEndpointTest` exception strips `matchId` from every endpoint, not only the report endpoint | medium | patch | `names.remove("matchId")` is global; the spec asked for one narrow exception |
| No test renders `LiveMatchScreen` or `ResultsScreen` with the report link; 400 and 5xx mapping untested; server validation branches (matchId length, malformed body, bad path, concurrent POST) untested | medium | patch | only the shared component, `BreakdownRow` and marks storage are tested directly |
| Rate-limit token spent before validation, 404 and 409 | medium | defer | same design as the 3.3 upload limiter and already deferred there; recorded |
| Rejoin after reload hides the live-reveal link (`questionSource` null); a published version of a soft-deleted question is reportable | low | defer | fail-closed and documented by the implementer; recorded |
| `report.link` missing from the catalogue | low | false | `catalogue.ts:772` has `report.link` |
| `surface` and `matchId` not cross-validated | low | false | the epic makes `matchId` optional |
| NUL characters give 500, non-JSON content type not Problem Details, code point against UTF-16 counting, no 404 or 403 retry handling, `matchId` spoofable, duplicated advice code, missing `status` index and CHECKs, count announced per keystroke, hard-coded "500" in copy, sessionStorage blocked | low | false | negligible, outside the epic criteria, or belongs to Story 3.6 |

## Design Notes

- Reports stay out of `RevealDetails`, so its other users do not change.
- Closing reports (publishing a fix or dismissing) is Story 3.6; here reports are only created.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q -pl contracts,services/core -am verify` from the repo root -- expected: green
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` in `web/` -- expected: green, entry at most 150 KB gzipped
