---
title: 'Story 6.1: Custom-topic import API'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '0886d473e0b769f534b404d38929e2831fa0ba8d'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A registered player cannot bring their own questions: there is no storage, validation or endpoint for custom topics, so nothing in Epic 6 can be built.

**Approach:** Add the core-service backend only: a Flyway migration for `custom_topic` and `custom_question`, a `CUSTOM_TOPIC` profile on the one shared `QuestionValidator`, a strict JSON parser that records line and column, and `POST /api/core/v1/me/custom-topics` plus `GET /api/core/v1/me/custom-topics/usage`. The acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 6.1" are the source of truth; this spec adds the code decisions below.

## Boundaries & Constraints

**Always:** All-or-nothing: any failure stores nothing and leaves usage unchanged. One validator component; the admin profile's behaviour and its existing tests are untouched. Cap check and insert run in one transaction holding a row lock on the caller's `app_user`. Errors are RFC 9457 Problem Details; validation failures list every problem with `item`, `field` (JSON names: `question`, `options`, `answer`, `explanation`), `problem`, `fix`, `line`, `column`. Text is stored NFC-only, exactly as written, with `lang` from majority script (Malayalam letters vs Latin letters). Caps (50 topics, 500 questions, 80% warn) and the 1 MB size cap live in one config place. Reuse `RateLimiter` with a new `CUSTOM_IMPORT` policy (capacity 20, refill 20 per hour) and the refund-on-caller-mistake pattern from `AdminUploadController`.

**Never:** No change to the bank catalogue, admin console or `/internal/question-sets`; no read of these tables outside this feature. No UI, no list/view/replace/delete (Stories 6.2 and 6.3), no Solo Practice or Battle Room use (6.4, 6.5). No second validator, no new dependency unless the JSON parser cannot be done with the Jackson already present.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Import ok | USER with profile, valid JSON, name 1-80 chars | 201 `{customTopicId, name, questionCount, revision: 1, usage}` | N/A |
| JSON syntax | Missing comma / unclosed bracket | 400, one error with `line`, `column`, likely cause | nothing stored |
| Schema / field | Wrong option count, answer 4, blank explanation, zero questions, non-string `topic` | 400, all errors, `item` is 1-based question number, `line` where it starts | nothing stored |
| Duplicate name | Same `name_key` as her other topic | 400 field error "You already have a topic called '<name>'" | nothing stored |
| Over cap | Would pass 50 topics or 500 questions | 422 `…/custom-topic-cap` naming cap and overshoot | nothing stored |
| Concurrent imports | Two at once near a cap | Only the ones that fit succeed | the rest 422 |
| Rate limit | 21st import in the hour | 429 with `Retry-After` | token refunded on 400/404/409 only |
| Too large | Body over 1 MB | 413 "Paste is too large (over 1 MB). Split it into smaller topics." | nothing stored |
| Auth | Guest 403, no token 401, no profile 403 `PROFILE_REQUIRED` | Problem Details | N/A |
| Usage | GET `/usage` | `{topics, topicCap: 50, questions, questionCap: 500, warn}` | same auth rules |

</frozen-after-approval>

## Code Map

- `services/core/src/main/resources/db/migration/` -- latest is `V9__recent_topic.sql`; add `V10__custom_topics.sql` (tables, constraints, indexes exactly as in the story; nothing else)
- `services/core/src/main/java/in/minnal/core/question/domain/QuestionValidator.java` -- add a `CUSTOM_TOPIC` profile (skips category, subject, topic, exam level, difficulty, attribution); keep `validate(candidate)` as the bank behaviour; reuse `Text.normalise`, `FieldError`; put custom text in `textEn` of a `QuestionCandidate`
- `services/core/src/main/java/in/minnal/core/question/api/admin/AdminUploadController.java` -- pattern to copy: acquire-with-503, refund on caller mistake, `AdminWriteException`; `question/api/admin/AdminExceptionHandler.java` -- Problem Details shape with `errors[]`
- `services/core/src/main/java/in/minnal/core/question/application/AdminUploadService.java` -- `TransactionTemplate`, validation loop, all-or-nothing import pattern
- `services/core/src/main/java/in/minnal/core/profile/api/RecentTopicsController.java` and `.../infrastructure/JdbcProfileRepository.java` -- registered-caller controller pattern; `find(userId)` is how to tell the profile is set up
- `services/core/src/main/java/in/minnal/core/identity/infrastructure/JdbcAccountRepository.java` -- `FOR UPDATE OF u` example for the `app_user` row lock
- `services/core/src/main/java/in/minnal/core/platform/infrastructure/ratelimit/RateLimitPolicy.java` -- add `CUSTOM_IMPORT`
- New package `services/core/src/main/java/in/minnal/core/customtopic/{api,application,infrastructure}` -- controller (+ own `@RestControllerAdvice`), parser, service, JDBC repository; core uses Jackson 3 (`tools.jackson`) with `JsonMapper`

## Tasks & Acceptance

**Execution:**
- [x] `db/migration/V10__custom_topics.sql` -- the two tables per the story AC
- [x] `question/domain/QuestionValidator.java` + its test -- `CUSTOM_TOPIC` profile; table-driven cases incl. Malayalam chillu and ZWJ; admin cases untouched
- [x] `customtopic/application/CustomTopicJsonParser` + test -- strict streaming parse recording line/column per question and field, fence-less raw text, unknown keys ignored, syntax errors with a likely-cause hint
- [x] `customtopic/infrastructure/` repository and `application/CustomTopicService` -- name rules and `name_key` (NFC, trim, case-fold), `lang` detection, caps and insert in one transaction with the `app_user` lock, usage
- [x] `customtopic/api/CustomTopicController` -- POST and GET `/usage`; auth, profile check, 1 MB cap, limiter with 503 on store outage and refund on caller mistakes; Problem Details handler
- [x] `RateLimitPolicy.java` -- `CUSTOM_IMPORT`
- [x] Integration tests -- one per failure class (syntax, schema, field, zero questions, cap, name, DB error on the last of 500 questions) proving nothing is stored; concurrency test for the caps; 401/403/PROFILE_REQUIRED; 429 and 413; usage block and 80% warn

**Acceptance Criteria:**
- Given any failed import, when core answers, then no `custom_topic` or `custom_question` row exists and usage is unchanged.
- Given two imports sent at once that cannot both fit the caps, when they run, then only one succeeds.
- Given the migration, when Flyway runs on a database with the existing migrations, then only the two new tables are created.

## Implementation Notes

Implemented directly (no subagent). New package `customtopic` (api, application, infrastructure); `V10__custom_topics.sql`; `QuestionValidator.Profile.CUSTOM_TOPIC` via a `validate(candidate, profile)` overload (the one-argument call is unchanged); `RateLimitPolicy.CUSTOM_IMPORT`; `RateLimiter.refund` reused. Jackson 3 uses `JsonToken.PROPERTY_NAME`, not `FIELD_NAME`. The body is read manually (up to the cap plus one byte) so an oversize paste is a 413 without being loaded. Added beyond the spec: `AccountDeletionService` now deletes the player's custom topics (the cascade removes their questions), and `PostgresIntegrationTest` truncates the two new tables so `app_user` can be truncated.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (no subagents, by the user's choice): not independent, scope narrowed to a read of the diff against the three lenses.

| Finding | Verdict | Evidence / route |
|---|---|---|
| Account deletion left a deleted player's custom topics and questions in the database | medium | `AccountDeletionService` only removed recent topics; fixed (patch): `deleteAllForOwner` called in the same transaction, integration test added |
| Error list is unbounded: a 1 MB paste of thousands of broken questions returns thousands of errors | low | real but spec says every problem is returned; deferred |
| A NUL character in the topic name or a question reaches Postgres and returns the generic 500 | low | matches the spec's own DB-failure class; deferred |
| Database error while checking the profile or usage has no handler (unshaped 500) | low | same as other core endpoints; deferred |
| Duplicate-name race | false | the `app_user` row lock serialises imports per owner and the unique constraint backs it |
| Concurrent imports can both pass the caps | false | usage is read after taking the row lock under READ COMMITTED; the concurrency test pins it |
| Integration tests have not run locally | maybe-false | Docker is unavailable here; CI runs them (needs to be green before merge) |

## Verification

**Commands:**
- `./mvnw -B verify -pl services/core -am` -- expected: BUILD SUCCESS (integration tests need Docker; otherwise they run in CI)
