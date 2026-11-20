---
title: 'Story 4.1: Topic picker'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'bcb9f65c11519d02e577fe97a0cd9979cd65206e'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Topic Duel and Solo Practice are "Coming soon" rows; a registered player cannot find a topic, see its size or return to recent ones, and no endpoint says which topics have enough published questions to play.

**Approach:** Add a core topic catalogue and per-user recent-topics API, plus one shared, lazy-loaded `TopicPicker` at `/play/topics`. Acceptance criteria: `_bmad-output/planning-artifacts/epics.md`, "Story 4.1: Topic picker" (source of truth; this spec adds no behaviour).

## Boundaries & Constraints

**Always:** Registered-only (no token 401, guest 403, Problem Details). Count only non-deleted questions' latest PUBLISHED version; counts computed, never stored. The threshold 10 lives in one config place that `/internal/question-sets` and Story 4.3 reuse. REST under `/api/core/v1`, camelCase JSON, per-user rate limit on the PUT. Strings in `ml` and `en`. Components never compute scores or correctness. Picker takes `{purpose, notice?, onSelect}` plus a `sources` option supporting only `BANK`. No attribution lines in commits, PRs or code.

**Never:** Create or alter any table except `recent_topic`. No cross-schema reads. No service-worker caching of `/api/**`. No picker code in the entry chunk. No Battle Room or custom-topic source, no real Duel or Solo screens (stubs only). Do not change the Quick Match row, guest Home behaviour or `/internal/question-sets` semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Boundary | Topic at 9 then 10 published | Hidden at 9, listed at 10; delete or move drops it within 60 s | N/A |
| Revalidate | `If-None-Match` equals the ETag | 304, no body | N/A |
| Guest | GUEST token or none on topics or recent-topics | 403 or 401 | Problem Details |
| Select | Tap a row | Fire-and-forget PUT, then `onSelect` | PUT failure ignored; unknown topic 404 |
| Recent cap | 6th topic used | Only the 5 newest kept; GET returns up to 3 eligible | N/A |
| Search | Malayalam or Latin text | NFC, case-insensitive substring over topic and subject | No match: empty line plus Clear |
| Offline | Cached list, no network | Rows `aria-disabled` with caption | No cache: banner plus error state |

</frozen-after-approval>

## Code Map

- `services/core/src/main/resources/db/migration/` -- latest is `V8__question_report.sql`; add `V9__recent_topic.sql` (confirm V9 is still free at merge).
- core `question/infrastructure/JdbcQuestionRepository.java` (`drawPublished` ~l.308) -- reuse its `DISTINCT ON (question_id) ... status='PUBLISHED'` latest-version CTE for the grouped count; subject and topic from `JdbcSubjectTopicRepository`; `content_category` and `topic_id` are on `question_version`.
- core `question/application/QuestionSetService.java` -- hosts the 10-question rule (`drawn.size() < count`); point it at the shared threshold.
- core new `question/api/TopicCatalogueController.java` (pattern: `question/api/QuestionReportController.java`: `BearerAuthenticator.requireRegistered`, `CacheControl`, own `@RestControllerAdvice`) -- `GET /topics` with ETag and 60 s in-memory catalogue; new `me` controller for `PUT` and `GET /me/recent-topics`, next to `profile/api/MeController.java`.
- core `profile/application/AccountDeletionService.java` -- add `recent_topic` delete inside the existing transaction; extend its test.
- core tests: `QuestionFixtures`, `MigrationIntegrationTest` (and its TRUNCATE list), `NoGuestResultEndpointTest` closed path list (avoid reserved body words).
- web `App.tsx` -- `ROUTES` is static-path only; add `/play/topics` via `lazy()` and prefix handling for `/play/duel/:id` and `/practice/:id` stubs (also lazy), following the `AdminRoute.tsx` lazy and guest-redirect pattern (`signInPath(returnTo)`).
- web `screens/home/ComingSoonModeRows.tsx`, `LockedModeRows.tsx` (`LOCKED_MODES`), `RegisteredHome.tsx` -- Duel and Solo become live links; Battle Room keeps the disabled row; guest rows stay locked.
- web new `screens/topics/` (`TopicPicker.tsx`, `topicsApi.ts`, stubs), TanStack Query keys `['topics']`, `['recentTopics']` with `staleTime` 5 min; clear them where `App.tsx` clears `['ratings']` on sign-out.
- web `i18n/catalogue.ts` (ml+en keys, `title.*`), `i18n/format.ts` (digit grouping), `shell/announce.ts` (polite count), `useDocumentTitle`; checks `scripts/check-dist.mjs` (150 KB entry budget, about 148 KB now), `check-i18n.mjs`, `check-tokens.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] `V9__recent_topic.sql` -- create `recent_topic` only -- per the migration criterion
- [x] core catalogue and recent-topics endpoints, threshold config, deletion cleanup -- per the epic's API criteria
- [x] core tests -- 9/10 boundary, ETag 304, 401/403, cap of 5, ineligible recent omitted, deletion
- [x] web `TopicPicker` lazy chunk, routes, stubs, Home rows, i18n -- per the epic's web criteria
- [x] web tests -- search, states, offline, focus, `lang`, 320 px and 200% text wrap

**Acceptance Criteria:**
- Given the epic's criteria for Story 4.1, when every verification command passes, then each is demonstrably met and entry gzip stays under 150 KB.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| No test for the PUT rate limit (429, Retry-After, per player) | medium | patch | Fixed: new integration test. |
| Category filter and latest-version selection untested | medium | patch | Fixed: two new tests (other category excluded; v2 moved topic; newer draft keeps v1 counted). |
| Topic deleted between existence check and insert gives 500 | low | patch | Fixed: FK violation now returns 404. |
| Stale `AccountDeletionService` javadoc | low | patch | Fixed. |
| Eligibility counts a question whose newest version is a draft | false | rejected | Versions are DRAFT, PUBLISHED or DISCARDED; an older PUBLISHED version stays live, so counting it is correct. |
| PUT after account deletion with a still-valid access token recreates recent_topic rows | low | defer | Real but limited to the access-token lifetime; fix needs an account-status check on the PUT. |
| 320 px and 200% text wrap not covered by a test | low | defer | jsdom cannot measure layout; needs a manual browser check. |
| Weak ETag, synchronized cache lock, concurrent prune, hardcoded KERALA_PSC on recents, `markTopicUsed` ignoring non-2xx, chunk-load error boundary, stub id validation, announce effect deps, layering, test-quality and i18n nits | low | rejected | Cosmetic or negligible at this scale; fixes add guards for cases no one will meet. |
| `sources` prop unused | false | rejected | The spec requires the option to exist for Epics 5 and 6. |

## Design Notes

- The picker is a separate chunk because the entry has about 2 KB left; Home only links to it, so no picker code or query hooks enter the entry.
- The 60 s catalogue cache is in-process; the ETag is a hash of the serialized body, so a recomputed but identical catalogue still returns 304.
- `recent-topics` filters by the same eligibility query as the catalogue, so one code path decides "playable".

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q -pl contracts,services/core -am verify` -- expected: success
- In `web/`: `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` -- expected: success, entry under 150 KB gzipped
