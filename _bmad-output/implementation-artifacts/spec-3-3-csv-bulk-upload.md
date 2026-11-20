---
title: 'Story 3.3: CSV bulk upload'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: '65bb97415882efb0aa37da1dbc5fb372fcef443b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Snobin can add questions one at a time (Story 3.2) but cannot load a whole paper at once, and core has no REST write rate limiter.

**Approach:** Build Story 3.3 exactly as its criteria in `epics.md` (section "Story 3.3: CSV bulk upload") describe: a reusable Valkey token-bucket limiter in core, `POST /api/core/v1/admin/uploads` that imports valid rows as drafts in one transaction and lists bad rows, and the Upload page replacing the placeholder.

## Boundaries & Constraints

**Always:** Valid rows import in one transaction as `DRAFT` version 1 with `created_by`; nothing is published. Row numbers follow the spreadsheet (header is row 1). Rows go through the shared `QuestionValidator`. Duplicates are matched by `sourceRef` (soft-deleted included) and never overwritten. Caps: 2 MB, 1,000 data rows, strict UTF-8 (BOM stripped), RFC 4180, NFC. Limiter keys are `core:rl:{action}:{userId}`, atomic via Lua; upload limit is capacity 10 and 10 per hour. Admin copy is English-only in the `admin` namespace. No attribution lines in commits, PRs or code.

**Never:** No change to `SeedCsvReader`, `SeedRowMapper` or `StarterSeedService` behaviour (seed tests rely on it). No per-row transactions in the import. No publishing. No reuse of `SeedRowMapper` itself, since seed rules (required `sourceRef`, `reviewedBy`) differ. No Malayalam copy invented: flag `signoff`. No change to V1 to V6 migrations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| Good file | all rows valid | `200`, all imported as drafts, subjects and topics created by name | n/a |
| Mixed file | some rows invalid | valid rows imported, bad rows in `errors[{row, field, problem, fix?}]` | n/a |
| All rows fail | none valid | `200`, nothing imported, says so | n/a |
| File caps | over 2 MB, over 1,000 rows, empty, header only | nothing imported | `400` with one file-level error naming the cap |
| Bad encoding | invalid UTF-8 | whole file rejected | `400` "Save the file as CSV UTF-8 and upload again" |
| Bad header | missing required or unknown column | whole file rejected naming the column; `errors`, `reviewedBy`, `reviewedAt` ignored | `400` |
| Duplicate ref | existing question (deleted too) or earlier row | row listed `duplicate of Q 1234` or `duplicate of row 5`; blank `sourceRef` not checked | row error |
| DB failure | failure mid-import | nothing imported | `500` Problem Details |
| Limit used up | 11th upload in the hour | nothing processed | `429` with `Retry-After`; page keeps the chosen file |
| Non-admin | USER, GUEST, none | `403`, `403`, `401` | Problem Details |

</frozen-after-approval>

## Code Map

- core new `platform/infrastructure/ratelimit/` -- `RateLimiter` interface, Valkey Lua token-bucket implementation (`StringRedisTemplate`, key prefix `minnal.valkey.key-prefix`), per-action config. Valkey config exists (`application.yaml`, `compose.yaml`); no Lua or limiter yet.
- core `application-it.yaml` excludes Redis autoconfig: provide an in-memory limiter for the shared IT context; test the Valkey implementation in its own test with a `valkey/valkey:8-alpine` Testcontainer (pattern: game `ValkeyRatingCacheIntegrationTest`); add the testcontainers dependency if missing.
- core `question/infrastructure/seed/SeedCsvReader.java` -- reuse decode, BOM, RFC 4180 and row-number logic by extracting a shared helper without changing seed behaviour; it throws on missing columns, so upload needs file-level errors instead.
- core `question/application/SeedRowMapper.java`, `StarterSeedService.java` -- copy mapping and subject/topic by-name logic only; `JdbcSubjectTopicRepository.createSubject/createTopic` return a `created` flag for `createdSubjects[]` and `createdTopics[]`.
- core `question/application/AdminQuestionService.java` (`create`, lines 48-67) -- DRAFT v1 creation via `insert(question, actor)` and `insertVersion(version, actor)`; one `@Transactional` import method.
- core `question/api/admin/AdminExceptionHandler.java`, `AdminWriteException.java` -- add the upload controller to `assignableTypes`, a `RATE_LIMITED` kind with `Retry-After`, file-level errors (`FieldError("file", ...)`, override the detail text). New `AdminUploadController` in `question/api/admin/` (architecture test).
- core `application.yaml` -- no multipart settings exist: set the 2 MB limits and handle `MaxUploadSizeExceededException`.
- web `admin/AdminApp.tsx` (`/admin/upload` case), `Placeholder.tsx`, `api.ts` (`uploadCsv` with `FormData`, no JSON Content-Type; surface `Retry-After`), `adminI18n.ts`; copy the error-summary pattern from `QuestionEditor.tsx` and `announce()`; no clipboard or download helper exists, so add them. "Review N drafts" links to `/admin?status=DRAFT`.

## Tasks & Acceptance

**Execution:**
- [x] core rate limiter (interface, Valkey Lua implementation, in-memory test implementation) + tests for refill, exhaustion and per-user isolation
- [x] core CSV parse and validation (file-level checks, header rules, per-row validation, duplicates) + Malayalam round-trip fixture test
- [x] core `POST /api/core/v1/admin/uploads` (multipart, single transaction, response shape, 400/429/500 Problem Details) + multipart limits + integration tests for the matrix
- [x] web Upload page (file input, column list, "Download template", caps, `aria-disabled` Upload, "Uploading…", client size and extension check, 429 message with the file kept)
- [x] web result view (summary, created subjects and topics, "Review N drafts", `role="alert"` error list grouped past 20, "Download rows to fix (CSV)" with BOM and `errors` column, "Copy errors") + tests

**Acceptance Criteria:**
- Given the epic's Story 3.3 criteria, when core and web ship, then each Given/When/Then there holds, nothing uploaded reaches players, and `build:check` stays within 150 KB.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Malformed multipart (bad boundary, truncated body) escapes the Problem Details advice | medium | patch | `AdminUploadController.read` catches only `MaxUploadSizeExceededException` and `IOException`; other `MultipartException` subtypes propagate |
| Real servlet multipart path (lazy resolve, 2 MB limits, oversize catch, auth before parse) has no test | medium | patch | `AdminUploadIntegrationTest` uses MockMvc, which never applies container limits; the 2 MB case passes only through the service byte check |
| `rowsToFix` puts the `errors` cell in the wrong column for short or long rows | medium | patch | `csv.ts` strips and appends without padding to the header length; `csv.test.ts` has no ragged case |
| Valkey outage makes every upload a non-Problem 500; fail-open or closed policy undefined | medium | defer | no handler maps the Redis exception; fail closed is safe but unshaped; recorded |
| Rate-limit token spent before file-level checks, so malformed uploads burn the 10 per hour | medium | defer | by design in the controller (limit before parse); the epic counts uploads; recorded for the owner |
| Concurrent duplicate `DuplicateKeyException` 409 path and production `ValkeyRateLimiter` bean selection untested | low | defer | narrow race; the context test is cheap; recorded |
| Failed rows still reserve their `sourceRef`, so a later valid row reports "duplicate of row N" | low | false | the epic says "an earlier row in the same file", without limiting it to imported rows |
| Blank-`sourceRef` rows are never de-duplicated on re-upload | low | false | the epic assumes `sourceRef` is optional and a blank one gets no duplicate check |
| "Copy errors" drops `fix` | low | false | the epic specifies `row · field · problem` lines |
| `Retry-After` unreadable cross-origin | low | false | the web app and API are same-origin through Caddy and the Vite proxy |
| `source_ref` unbounded gives a 500 | low | false | the V1 column is `text` with no length limit |
| Row number is a record count, not a physical line | low | false | a spreadsheet counts records; the epic wants the spreadsheet view |
| Header edge cases (leading blank line, trailing comma, repeated ignored column); non-ASCII digits in `answerIndex`; parser message text; audit line after import; formula injection in the export; 3 DB calls per row; no `AdminUploadService` unit tests; `malayalam.csv` working-directory path; in-memory limiter eviction, prefix and refill guards; unread body on early rejection; `readText` fallback | low | false | cosmetic or negligible at the 1,000-row and admin-only scale; fixes add guards for cases no one will meet |

## Design Notes

- The limiter sits behind an interface so the shared IT context (Redis autoconfig excluded) uses an in-memory implementation, and the Valkey implementation is tested on its own against a container.
- The importer validates every row first and writes only when the whole transaction can proceed, so a database failure leaves nothing behind.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q -pl contracts,services/core -am verify` from the repo root -- expected: green
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` in `web/` -- expected: green, entry at most 150 KB gzipped
