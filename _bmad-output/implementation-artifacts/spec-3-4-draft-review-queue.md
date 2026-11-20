---
title: 'Story 3.4: Draft review queue'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: '2d37f042315d4b82a05a33884dc390679b38ca07'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Drafts from the editor (3.2) and CSV upload (3.3) have no way to go live or be rejected, so nothing admin-made ever reaches players. There is no draft queue, no publish or discard endpoint, and no record of who published or discarded.

**Approach:** Build Story 3.4 exactly as its criteria in `epics.md` (section "Story 3.4: Draft review queue") describe: a V7 migration, `GET admin/drafts`, single and bulk publish and discard, publish and discard actors shown in the Questions list and editor history, and the Drafts page with keyboard shortcuts and a 5-second client-side delayed commit with Undo.

## Boundaries & Constraints

**Always:** Publish re-runs the shared validator and, in one transaction, sets `PUBLISHED` with `published_by/at` (and the existing `reviewed_by/at` the V1 CHECK requires); earlier published versions are never changed. Only a `DRAFT` of a non-deleted question can be published or discarded (`409` otherwise, `400` with field errors for validation). Bulk endpoints take up to 100 items and apply each independently with per-item results. The client sends a commit only after the 5-second Undo window, or at once on in-console navigation, or with `keepalive` on tab close. Shortcuts are ignored in form fields and with Ctrl, Alt or Meta, and have visible button equivalents. Admin copy is English-only. No attribution lines in commits, PRs or code.

**Never:** No edits to Flyway V1 to V6, `drawPublished`, `QuestionSetService`, `MatchState` copy semantics, or the single-slot router guard contract used by `useLeaveGuard`. No change to `FakeCore` default behaviour (add knobs only). No Malayalam copy invented. No server-side undo or revert of a published version.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| Publish new question | DRAFT v1 | `PUBLISHED`, `/internal/question-sets` serves it from the next call | n/a |
| Publish fix | DRAFT v3 over published v2 | v3 serves; v2 unchanged in content and status | n/a |
| Discard | DRAFT | `DISCARDED`; published version keeps serving; a question with only discarded versions is never served | n/a |
| Not a draft or deleted question | PUBLISHED, DISCARDED or deleted | nothing changes | `409` |
| Invalid stored content | draft fails the validator | nothing changes | `400` with `errors[]` |
| Bulk | 100 items, one fails | others applied, per-item results | over 100: `400` |
| Drafts list | non-deleted DRAFTs | oldest first, `replacesVersion` and changed fields | `size` capped at 100 |
| In-flight match | set fetched before the publish | reveals and `MATCH_ENDED` keep the old version | n/a |
| Web undo | Publish then Undo within 5 s | no request sent, row restored with focus | n/a |
| Web commit fails | server error | row returns with the `detail` inline | n/a |
| Non-admin | USER, GUEST, none | `403`, `403`, `401` | Problem Details |

</frozen-after-approval>

## Code Map

- core `db/migration/V7__publish_discard_actors.sql` -- `question_version.published_by`, `published_at`, `discarded_by`, `discarded_at`. Update `MigrationIntegrationTest` (exact column map).
- core `question/domain/QuestionVersion.java` (`publish`, `discard`, `requireDraft`) and `JdbcQuestionRepository` (`updateDraft` is what publish persists through today; `discardOpenDraft`) -- add publish and discard persistence with actor and timestamp guarded by `status='DRAFT'`; keep `updateDraft` semantics.
- core `question/application/AdminQuestionService.java` (`prepare` maps content to `QuestionCandidate` for the validator), `AdminWriteException`, `AdminExceptionHandler` (add new controller to `assignableTypes`) -- publish, discard, bulk with per-item results (pattern: `CsvUploadResult`).
- core `question/api/admin/` new `AdminDraftController` for `GET /admin/drafts`, bulk `publish` and `discard`; single publish and discard under `AdminQuestionWriteController`.
- core `JdbcAdminQuestionRepository` (`list`, `detail`), `AdminQuestionDetail.HistoryEntry`, `AdminQuestionRow` -- drafts query (DRAFT, non-deleted, `created_at` ascending, `replacesVersion` = highest published below the draft, changed fields by comparing `QuestionContent`), actors and times in history and list.
- core tests: `QuestionFixtures`, `AdminQuestionWriteIntegrationTest` pattern; draw-publish-draw test for `/internal/question-sets`.
- game `FakeCore` (`services/game/src/test/.../support/FakeCore.java`) -- add a per-call version and text knob; test that a match started on v1 keeps v1 in reveals and `MATCH_ENDED` after the fake serves v2.
- web `admin/AdminApp.tsx` (`/admin/drafts` case, top bar for the shortcuts switch), `Placeholder.tsx`, `QuestionEditor.tsx` (footer Publish and Discard for a draft; history actors), `QuestionsPage.tsx`, `ConfirmDialog.tsx` (no list body: add a help dialog), `shell/announce.ts`, `shell/router.ts` `setNavigationGuard` (single slot: commit pending actions and return false), `admin/api.ts`. `apiFetch` is async, so the unload commit needs a raw `fetch` with a token captured earlier. Build a compact row preview (reuse `textFor` from `QuestionPreview.tsx`); localStorage pattern with try/catch as in `i18n/language.ts`.

## Tasks & Acceptance

**Execution:**
- [x] core V7 migration, repository publish and discard, service methods, validator re-run, `409` and `400` handling, `MigrationIntegrationTest` update
- [x] core `GET /admin/drafts`, single and bulk publish and discard endpoints, actors in history and list, integration tests for the matrix
- [x] core test that `/internal/question-sets` serves the new version after publish, never a draft or discarded one; game test with a versioned `FakeCore` for in-flight matches
- [x] web Drafts page (table, bilingual preview, tags, replaces and changed fields, Publish, Discard, Edit, select boxes, bulk buttons, empty state)
- [x] web shortcuts (P, D, E, J, K, `?` help dialog, top-bar switch stored per browser), roving `tabindex`, editor toolbar Publish and Discard
- [x] web delayed commit (5 s Undo, batch Undo, announcements, focus moves, commit on navigate, `keepalive` on tab close, failure returns the row) + tests

**Acceptance Criteria:**
- Given the epic's Story 3.4 criteria, when core and web ship, then each Given/When/Then there holds, only published versions reach players, and `build:check` stays within 150 KB.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Publish validates a draft read earlier but the UPDATE checks only `status='DRAFT'`, so a draft edited in between publishes unvalidated content | high | patch | `publishDraft` has no `row_version` guard; fix compares the version that was read, with no API change |
| A runtime error on bulk item N returns 500 after items 1..N-1 committed, and the client marks all items failed | medium | patch | `AdminDraftService.apply` catches only `AdminWriteException` |
| Shortcuts compare `event.key` to Latin letters, so they never fire on a Malayalam layout | medium | patch | `shortcutFrom` uses `event.key` only; this is a Malayalam-language product |
| Queue fetches 100 drafts, shows no total, so a 1,000-row upload looks like 100 drafts | medium | patch | `fetchDrafts` uses `size=100` and ignores `totalItems` |
| Drafts category and topic filters, list `publishedBy` and `discardedBy`, and bulk item with missing or zero version are not pinned by tests | medium | patch | fixtures share one placement; list assertions exist only on the detail endpoint; no zero-version bulk case |
| Publish and discard do not take the reviewed `rowVersion`, so the reviewer can publish content edited after the review | medium | defer | needs a request body on endpoints the epic defines without one (public API change); the server-side read-to-update race is patched; recorded |
| Tab-close commit drops an action when the token is not captured yet or has expired; the batch is left with no timer | medium | defer | the token is captured at queue time, so the window is narrow; recorded |
| A commit that fails after the admin left the Drafts page is shown only when they return | low | defer | implementer noted it; recorded |
| `HelpDialog` has no focus trap | low | false | same pattern as the other admin dialogs, accepted in the 3.2 triage |
| Undo window fixed at 5 s | low | false | the epic specifies 5 s |
| Malformed bulk body is not Problem Details; blank `category` NPE | low | false | `AdminExceptionHandler` covers `AdminDraftController` and `HttpMessageNotReadableException`; `Enums.parse` returns empty for blank |
| Cross-service test only covers each half | low | false | recorded in the spec's Design Notes as a known gap |
| No outbox event, no duplicate-content check at publish, thin audit log, V7 index and CHECKs, N+1 replaces lookup, duplicate bulk item, offset cap, stale failure messages, nested main, duplicated assertion, wrong 409 text for a deleted question | low | false | outside the epic criteria or negligible at this scale |

## Design Notes

- The epic asks for an integration test across core and game-service. The repo has no module that depends on both, so the verification is split: a core test that the next draw returns the new version, and a game test that a match keeps the version it fetched. The gap is recorded, not hidden.
- Delayed commit is client-side only, so a published version never needs reverting.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q -pl contracts,services/core,services/game -am verify` from the repo root -- expected: green
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` in `web/` -- expected: green, entry at most 150 KB gzipped
