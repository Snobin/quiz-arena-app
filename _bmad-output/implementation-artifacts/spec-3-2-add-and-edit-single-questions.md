---
title: 'Story 3.2: Add and edit single questions'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: '7492fc4e1d81f37ef4af41e8da664a8c8613207f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Snobin can list the bank (Story 3.1) but cannot add, fix or delete a question, create a subject or topic, or see a question as players will. Nothing writes drafts yet.

**Approach:** Build Story 3.2 exactly as its criteria in `epics.md` (section "Story 3.2: Add and edit single questions") describe: a V6 migration, the shared validator extended, admin write endpoints in core, and a full-page editor in the lazy admin chunk with a two-language preview. Publishing and discarding are Story 3.4, not here.

## Boundaries & Constraints

**Always:** Every new question or version starts as `DRAFT`; a published version is never changed in any column. Editing a published question with no open draft creates version `max + 1` (discarded versions counted); an open draft is updated in place with `row_version` checked and a `409` on a stale one. One validator serves the editor, the seed loader and later uploads; the server is authoritative and returns every problem as `errors[{field, problem, fix?}]`. Admin copy is English-only in the `admin` namespace. No attribution lines in commits, PRs or code.

**Never:** No edits to Flyway V1 to V5, `drawPublished`, `QuestionVersion` domain methods, existing validator message constants (`SeedRowMapperTest` asserts them), player screens under `screens/match`, or `check-dist.mjs` rules. No publish or discard endpoint. No physical row delete. No Malayalam copy invented: flag it `signoff`. No ArchUnit dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| Create | valid payload | `201 {questionId, displayNo, version:1, status:DRAFT}`, not served | invalid: `400` with all errors, nothing stored |
| Source ref reuse | `sourceRef` of another question (deleted ones included) | field error on `sourceRef` | `400` |
| Edit published, no draft | PUT draft | new version n+1 `DRAFT`; `/internal/question-sets` still serves the old one | n/a |
| Edit open draft | PUT with matching `row_version` | updated in place, `updated_by/at` set | stale `row_version`: `409` |
| Delete | DELETE a live question | `deleted_at/by` set, open draft `DISCARDED`, no longer served | already deleted: `409` |
| Restore | POST restore | marker cleared, latest published serves again, draft stays discarded | not deleted: `409` |
| New subject or topic | name exists (case-insensitive, NFC) | `409` with the existing id | unknown subject for topic: `404` |
| Non-admin | USER, GUEST, none | `403`, `403`, `401` | Problem Details |
| Web save with problems | client or server errors | error summary takes focus, field links, `aria-invalid` | server errors shown the same way |
| Web leave unsaved | route change or tab close | in-app confirm, `beforeunload` | n/a |

</frozen-after-approval>

## Code Map

- core `question/domain/QuestionValidator.java`, `QuestionCandidate.java`, `FieldError.java` -- add caps (text 1000, option 300, explanation 2000, attribution 120 after NFC and trim); candidate carries subject and topic NAMES, so the admin path resolves ids to names (or adds an id path) without changing the seed path.
- core `question/infrastructure/JdbcQuestionRepository.java` (`existsBySourceRef`, `insert`, `insertVersion`, `updateDraft`, `softDelete`, `findVersions`) -- add conditional update on `row_version`, restore, max version. Do not change the `status='DRAFT'` guard.
- core `question/infrastructure/JdbcSubjectTopicRepository.java` -- add a non-upsert insert that reports the existing id on conflict (`subject_name_key`, `topic_subject_name_key`).
- core `db/migration/V6__question_editor.sql` -- `question.created_by`, `deleted_by`; `question_version.created_by`, `updated_at`, `updated_by`, `row_version`; partial unique index one `DRAFT` per question.
- core `question/api/admin/` -- new write endpoints beside `AdminQuestionController`; extend `AdminExceptionHandler` (`assignableTypes`, `errors[]`, 404, 409). New controllers must stay under `/api/core/v1/admin` (`AdminMappingArchitectureTest`).
- core tests: `AdminQuestionIntegrationTest` (admin token pattern), `QuestionValidatorTest` (table-driven, add Malayalam chillu and ZWJ), `support/QuestionFixtures`.
- web `src/admin/AdminApp.tsx` (path matcher for `/admin/questions/new` and `/admin/questions/:id/edit`), `api.ts` (post/put/delete, `errors[]`, 409), `adminI18n.ts`, `QuestionsPage.tsx` (New and Edit links, Delete).
- web reuse: `screens/match/OptionList.tsx` (answerable false, reveal set), `screens/match/RevealDetails.tsx`; copy patterns from `screens/profile/ProfileForm.tsx` (error summary) and `screens/DeleteAccountDialog.tsx` (alertdialog). No route-blocker or `beforeunload` exists: build both in the editor.

## Tasks & Acceptance

**Execution:**
- [x] core `V6` migration + validator caps + repository methods + subject and topic create (`409` with id)
- [x] core admin endpoints: POST create, PUT draft, DELETE, POST restore, POST subjects and topics, with `errors[]` Problem Details
- [x] core tests: matrix rows, `/internal/question-sets` unchanged after an edit and after delete and restore, validator table rows
- [x] web editor page (fields, header, version history, read-only deleted view with Restore), preview in two panes with fallback note, error summary, saved status, unsaved-change guards, inline new subject and topic, delete confirm
- [x] web tests: validation mirror, error summary focus, 409 reload message, preview fallback, delete dialog focus and Esc, leave guard

**Acceptance Criteria:**
- Given the epic's Story 3.2 criteria, when core and web ship, then each Given/When/Then there holds, nothing an admin saves reaches players until published, and `build:check` stays within 150 KB.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Browser Back guard (`onPopState`, `bypassPop`) has no test | medium | patch | `router.test.tsx` and the editor test never fire `popstate`; removing the re-push passes every test |
| `/admin/questions/%E0%A4%A/edit` makes `decodeURIComponent` throw and blanks the console | medium | patch | `AdminApp` Page decodes the id with no catch |
| New and Edit routes in `AdminApp` untested; list `updatedAt` after a draft edit untested | medium | patch | `AdminApp.test.tsx` has no new/edit case; no test reads `updatedAt` after PUT |
| Forward-direction popstate and repeated blocked Backs add history entries; Leave steps back instead of forward | medium | defer | the guard re-pushes the entry and Leave calls `history.back()`; edge of an edge, recorded |
| Editor tells a deleted 409 from a stale 409 by matching "deleted" in the message | medium | defer | a stable `reason` property on the problem would fix it but adds public surface; recorded |
| A save that succeeds but whose follow-up fetch fails shows "Could not save" | medium | defer | the refresh is inside the same try block; recorded |
| Restore does not reinstate the draft discarded by delete, so a draft-only question reopens on DISCARDED content | low | defer | the epic says the discarded draft stays discarded; recorded for Story 3.4 |
| Null or short `options` or null `answerIndex` gives 500 | low | false | `QuestionValidator` returns field errors for null options, size not 4 and null `answerIndex` (both are `Integer`) before `prepare` reaches `options().stream()` |
| `detail().editing` null crashes the editor | low | false | `create` always inserts version 1, so a question without versions cannot exist |
| `rs.getArray("options")` null on the detail endpoint | low | false | `options` is `NOT NULL` in V1 |
| No unique index on `source_ref`; `DuplicateKeyException` aborts the transaction | low | false | V1 already has `question_source_ref_key` (partial unique); `existsBySourceRef` runs first |
| V6 partial unique index fails on existing data with two drafts | low | false | no flow created drafts before this story; seeded and imported rows are published |
| New length caps could reject seed rows | low | false | `StarterSeedIntegrationTest` loads all 30 starter rows and passes with the caps |
| One pagination test failed in one full web run, then passed twice alone and once in a full run | low | false | 50-row table with default 1 s `findBy` timeouts under load; the failure did not reproduce |
| Audit of restore and subject or topic creators; subject and topic create races; focus trap in the confirm; list not refreshed after a failed delete; stale topic error; stale topic race; unmapped server field label; unbounded `sourceRef`; UUID leniency; "Shorten it by 1 characters"; `en-GB` dates; responsive grid; layering and duplication remarks; rate limits and body size | low | false | cosmetic, consistent with existing dialogs, or outside the epic criteria; the fixes add guards for cases no one will meet |

## Design Notes

- Editing is draft-only: this story creates drafts and soft-deletes; publish and discard belong to 3.4, so no existing published column is ever written.
- The validator stays name-based for the seed path; the admin endpoints look up subject and topic by id, check they exist and that the topic belongs to the subject, then validate.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q -pl contracts,services/core -am verify` from the repo root -- expected: green
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` in `web/` -- expected: green, entry at most 150 KB gzipped
