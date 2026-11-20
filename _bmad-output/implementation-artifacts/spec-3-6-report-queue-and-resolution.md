---
title: 'Story 3.6: Report queue and resolution'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '98f720936a46f0125382b3e691ad3975e0beecda'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Player reports (Story 3.5) are stored but Snobin cannot see, triage or close them. Nothing resolves a report when a fix is published, and the Reports nav item is still a placeholder.

**Approach:** Build Story 3.6 exactly as its criteria in `epics.md` (section "Story 3.6: Report queue and resolution") describe: admin read and dismiss endpoints, automatic resolution of older open reports inside the publish transaction, dismissal of open reports when a question is deleted, and the Reports page with a nav badge, Open and Closed tabs, an Undo-delayed Dismiss, and an "Open in editor" banner.

## Boundaries & Constraints

**Always:** Reports close only by publishing a newer version (every `OPEN` report on that question with a lower version becomes `RESOLVED_FIXED` with `fixed_by_version`, `resolved_by`, `resolved_at`, in the same transaction as the publish) or by dismissing with a required note of 1 to 500 characters. Discarding a fix draft leaves reports open; an undone publish commits nothing. A delete dismisses open reports with the note "Question deleted"; a restore never reopens them. Records are never deleted. The reporter is shown by current display name, "Deleted player" for a deleted account, and "Player" when no profile exists; never an email or user id. Notes are shown as plain text. Dismiss uses the 5-second client-side delayed commit with Undo, focus move and polite announcement like Publish. Admin copy is English-only. No attribution lines in commits, PRs or code.

**Never:** No change to `draftActions.ts` behaviour or tests, to publish and discard transaction boundaries, to the per-item bulk loop, to `publishDraft`/`discardDraft` guards, or to V1 to V8. No auto-closing of a report on an already superseded version. No new table.

**Decision:** add an optional `questionId` filter to `GET /admin/reports` so the editor banner can list the notes. Add `GET /admin/reports/summary` for the nav badge, as the epic says.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| Open queue | `GET /admin/reports?status=OPEN` | groups per `{questionId, version}`, most reports first then oldest `firstReportedAt`; `superseded` and pending-draft info | `size` capped at 100 |
| Closed queue | `status=CLOSED` | groups by `resolvedAt` descending with status, closer, time, note | n/a |
| Badge | `GET /admin/reports/summary` | `{openCount}` | n/a |
| Publish fix | publish v3 over v2 with open reports on v1 and v2 | those reports become `RESOLVED_FIXED`, `fixed_by_version` 3, same transaction | publish fails: reports stay open |
| Discard fix draft | discard | reports stay open | n/a |
| Dismiss | `POST /admin/reports/dismiss {questionId, version, note}` | every `OPEN` report on that version `DISMISSED` with the note | no note: `400` field error; no open reports left: `409` |
| Delete question | open reports exist | `DISMISSED`, note "Question deleted", deleting admin as closer; restore does not reopen | n/a |
| Deleted reporter | account deleted | report stays, reporter "Deleted player" | n/a |
| Non-admin | USER, GUEST, none | `403`, `403`, `401` | Problem Details |
| Web Undo | Dismiss then Undo within 5 s | no request sent, row restored with focus | n/a |
| Web commit fails | server error | row returns with the `detail` inline | n/a |

</frozen-after-approval>

## Code Map

- core `question/infrastructure/JdbcQuestionReportRepository.java` (3.5; "closing is Story 3.6" comment) -- add grouped read queries, summary count, `resolveOlderOpen(questionId, newVersion, actor, now)`, `dismiss`, `dismissAllForQuestion`. Reporter name: `app_user u LEFT JOIN user_profile p` with `CASE WHEN u.status='DELETED' THEN 'Deleted player' ELSE coalesce(p.display_name,'Player') END`; never select the email.
- core `question/application/AdminDraftService.java` (`publishInTransaction`, after `questions.publishDraft` returns true) -- call `resolveOlderOpen` in the same transaction; bulk runs each item in its own transaction, so no other change. `discardInTransaction` untouched.
- core `question/application/AdminQuestionService.java` (`delete`, ~100-107, `@Transactional`) -- after `softDelete` and `discardOpenDraft`, dismiss the question's open reports; inject the report repository. `restore` untouched.
- core new `question/api/admin/AdminReportController.java` mapped to `/api/core/v1/admin/reports` (`GET`, `GET /summary`, `POST /dismiss`); add it to `AdminExceptionHandler` `assignableTypes`. Pattern: `AdminDraftController`. Text of the reported version from the content columns in `JdbcAdminQuestionRepository` (make `CONTENT_COLUMNS` package-private).
- core tests: `NoGuestResultEndpointTest` closed list (add the three paths; avoid body names containing match, score, result, guest, points, participant), `QuestionFixtures`, `AdminDraftIntegrationTest` pattern. No migration; `MigrationIntegrationTest` and TRUNCATE already cover `question_report`.
- web `admin/AdminApp.tsx` (`NAV`, `Page()` `/admin/reports`; badge "Reports (N)" from a `['admin','reports','summary']` query; update `AdminApp.test.tsx` nav labels), `Placeholder.tsx`, `api.ts` (`REPORTS_PATH`, `fetchReportSummary`, `fetchReports`, `dismissReports`), `adminI18n.ts`.
- web new `reportActions.ts` copying the `draftActions.ts` pattern (batch carries a precomputed `{path, body}` so the `pagehide` keepalive works for the note body; `UNDO_MS`, `announce`), a dismiss variant of `UndoLine`, `ReportsPage.tsx` modelled on `DraftsPage.tsx` (expandable groups, roving `tabindex`, focus to next row, previous, else heading). Open and Closed tabs reflected in the URL (export or copy the `filters.ts` URL helper; do not reuse `Filters.status`).
- web `QuestionEditor.tsx` -- banner "Reported: v2 · 3 reports" and the notes above the form from `?reportedVersion=` (`searchParam`) plus `fetchReports` with the `questionId` filter; says so when the reported version is older than the latest published. The editor already opens the open draft, else the latest published.
- web invalidation: add `['admin','reports']` (and the summary) wherever publish, delete or dismiss commits (`draftActions.ts` commit, `QuestionsPage.tsx` delete).

## Tasks & Acceptance

**Execution:**
- [x] core report read queries, summary, dismiss, `AdminReportController`, Problem Details wiring
- [x] core publish resolves older open reports in the same transaction; delete dismisses open reports; tests including undo and discard leaving reports open, deleted reporter, restore not reopening
- [x] core integration tests for the matrix and the closed-list update
- [x] web Reports page (table, expandable notes as plain text, tags "superseded by vN" and "draft vN pending", Open and Closed tabs in the URL, empty states, nav badge)
- [x] web Dismiss (inline required note 1 to 500, delayed commit with Undo, focus and announcements, failure inline) and "Open in editor" banner with notes
- [x] web tests and `build:check` within 150 KB

**Acceptance Criteria:**
- Given the epic's Story 3.6 criteria, when core and web ship, then each Given/When/Then there holds, reports are never deleted, and the admin chunk stays out of the player bundle.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| No test for pagehide keepalive or commitPendingReports (gap, blind, edge) | medium | patch | No test named either path; added two tests in `ReportsPage.test.tsx`, both pass. |
| `aFailedPublishLeavesReportsOpen` fails before publishDraft, so it does not pin the same-transaction rule | low | defer | Needs fault injection; the call sits inside `transactions.execute`. |
| Groups beyond 100 unreachable, no paging in UI | low | defer | Spec caps size at 100 and the page shows "Showing X of Y"; paging not in the intent. |
| Dismiss on unknown question or version returns 409, not 404 | false | rejected | Matrix says 409 when no open reports are left. |
| New report on a superseded version stays OPEN until next publish | false | rejected | Spec: no auto-closing on an already superseded version. |
| pagehide with token null drops the dismissal | low | rejected | Same pattern as the reviewed `draftActions.ts`; token is captured when the dismissal is queued. |
| bfcache restore shows stale rows | low | rejected | Fix adds listeners and state for an unlikely case. |
| 409 failure message lost because the row disappears | false | rejected | A 409 means nothing is open, so the row correctly goes; other errors keep the row and show `detail`. |
| Reports and texts queries fetch other versions of the page's questions | low | rejected | Bounded by 100 groups; fix adds query complexity. |
| Banner silent when no open group, badge not polled, tab ARIA, hardcoded delete note, N round trips, triplicated limit | low | rejected | Cosmetic or negligible; no named harm. |
| Resolve covers only the draft-service publish path | false | rejected | `publishInTransaction` is the only publish path, bulk calls it per item. |

## Design Notes

- Resolution happens inside the existing per-item publish transaction, so a bulk publish resolves reports per item and a failed item leaves its reports open.
- `reportActions.ts` copies the delayed-commit pattern instead of generalising `draftActions.ts`, to keep the reviewed draft queue untouched.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q -pl contracts,services/core -am verify` from the repo root -- expected: green
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` in `web/` -- expected: green, entry at most 150 KB gzipped
