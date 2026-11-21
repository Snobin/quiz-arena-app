---
title: 'Story 4.3: Solo Practice'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '79755879e45af0f9f672f6cd957493361f9af82c'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Registered players cannot drill one topic untimed with instant answers; `/practice/:id` is a stub from Story 4.1, so "Solo Practice" on the mode list leads nowhere.

**Approach:** Add a Valkey-only Solo Practice REST API in core and a lazy Solo Practice screen replacing the stub. The acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 4.3" are the source of truth and are not repeated here.

## Boundaries & Constraints

**Always:** Correctness, answer index, explanation and attribution leave core only in the answer response (AD-5); components never compute correctness. Reuse `TopicThreshold` for the 10-question rule. REST under `/api/core/v1/solo/**`, camelCase, RFC 9457 errors; `GUEST` gets 403, no token 401. `source` stays a tagged object. All new web code is lazy-loaded. Both languages (`ml`, `en`) for every string.

**Never:** No Flyway migration, no Postgres table, no stream event, no call to another service, no change to ratings, boards or match history. No volt, peak band, timer, score or opponent on the screen. No custom source (422 until Epic 6). Do not alter `/internal/question-sets`, realtime contracts or `QuestionView`. Do not raise the entry chunk size.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start | USER, topic with 10+ published | 201, new session, earlier active session ended | topic under 10: 422 `…/topic-unavailable`; unknown id: 404; CUSTOM: 422 |
| Next | Active session | Served question, `current` recorded; unanswered `current` is returned again | other user, expired or unknown session: 404 |
| Answer | `current` question and version | Result with answer, explanation, counts | non-current question or second answer: 409, first result unchanged; `optionIndex` outside 0-3: 400 |
| End of pool | All served | Pool rebuilt, `cycle` + 1, `reshuffled: true`, last answered question not first | soft-deleted question skipped on its turn |
| Old version | Publish happened after serving | Answer checked against the served version | N/A |
| Stop | 1+ answered / none answered | Summary card / straight to picker | expired: "timed out" card with last tally |
| Guest on `/practice/:id` | No session | Sign-in prompt with `returnTo`; no request sent | N/A |

</frozen-after-approval>

## Code Map

- `services/core/src/main/resources/db/migration/` -- latest is `V9__recent_topic.sql`; V10 is free and stays unused.
- `services/core/src/main/java/in/minnal/core/question/application/TopicThreshold.java` -- the shared 10-question rule (`minQuestions()`); inject, do not copy the number.
- `services/core/.../question/infrastructure/JdbcQuestionRepository.java` -- `drawPublished(DrawCriteria)` (~l.311) has the latest-`PUBLISHED`-per-question CTE for the pool; `findVersion(questionId, version)` (~l.252) loads the exact version for answer checks (versions are immutable).
- `services/core/.../question/application/TopicCatalogueService.java` and `JdbcSubjectTopicRepository` -- topic existence, `topicName`, `subjectName`, published counts.
- `services/core/.../platform/infrastructure/ratelimit/{RateLimitPolicy,RateLimiter}.java` -- add `SOLO_ANSWER`/`SOLO_START` policies, following `RECENT_TOPIC`; core already has `spring-boot-starter-data-redis` (see `ValkeyRateLimiter`, `RedisStreamPublisher`) for `core:solo:*` keys and the 2 h sliding TTL.
- `services/core/.../profile/api/RecentTopicsController.java`, `question/api/QuestionReportController.java` -- pattern for `BearerAuthenticator.requireRegistered`, `CacheControl.noStore()`, local `@RestControllerAdvice` ProblemDetail mapping. New: `solo/api/SoloPracticeController.java`, `solo/application/SoloPracticeService.java`, `solo/infrastructure/ValkeySoloSessionStore.java`.
- `contracts/.../realtime/QuestionView.java` -- `QuestionView.of(InternalQuestion)` is the answer-free view; reuse for `next`. Contracts need no change; solo DTOs stay inside core.
- `QuestionReportService` / `QuestionReportRequest` -- `surface` already accepts `SOLO`, `matchId` nullable; no core change.
- core tests: `NoGuestResultEndpointTest` closed-path list, `QuestionFixtures`, a Valkey test container as used by the rate-limit tests.
- `web/src/screens/topics/TopicsRoutes.tsx` -- `PRACTICE_PATH` stub to replace; `TopicPicker.tsx`, `topicsApi.ts` (`TOPICS_QUERY_KEY`), `signInPath`. Add `screens/practice/` (`PracticeScreen.tsx`, `practiceApi.ts`, summary) in the same lazy chunk or a new lazy one.
- `web/src/screens/match/OptionList.tsx` -- commit-on-lift; its reveal is the live-match styling (volt ✓). Not reusable unchanged here: extract or add a non-volt reveal variant without growing the entry chunk.
- `web/src/screens/match/RevealDetails.tsx`, `web/src/report/ReportQuestion.tsx` -- explanation, attribution, "തെറ്റുണ്ടോ?" link (`surface: 'SOLO'`).
- web `shell/announce.ts`, `shell/online.ts`, `i18n/useDocumentTitle.ts`, `i18n/catalogue.ts`; checks `scripts/check-dist.mjs` (entry 149.6 of 150 KB gzipped), `check-i18n.mjs`, `check-tokens.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] `services/core/.../solo/**` -- session store, service and controller per the epic's API criteria -- Valkey-only, answer secrecy
- [x] `RateLimitPolicy.java` -- solo start and answer buckets -- epic: per-user buckets on REST writes
- [x] core tests -- serialization test (no answer fields on `next`), 12-question property test (no repeat per cycle), cross-user 404, guest 403, 20-question session leaves ratings tables and board keys unchanged, matrix cases -- matrix and epic ACs
- [x] `web/src/screens/practice/**` and `TopicsRoutes.tsx` -- Solo screen, summary, expired and error states, `sessionStorage` resume, guest prompt -- replaces the stub
- [x] web tests -- tally, result in place, reshuffle notice, focus and announce order, Stop with and without answers, `aria-disabled` offline
- [x] `i18n/catalogue.ts` -- ml and en strings, titles -- `check:i18n`

**Acceptance Criteria:**
- Given the production build, when `check:dist` runs, then the entry chunk is no larger than before and the practice screen is a separate chunk.
- Given the repository after this story, when migrations are listed, then V9 is still the last.

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `GET /next` rewrites the session with no rate limit | medium | patch | Fixed: `next` uses the SOLO_ANSWER bucket. |
| 429 and Retry-After for start and next untested | medium | patch | Fixed: new per-player test. |
| Offline Stop leaves the Back guard blocking the player | medium | patch | Fixed: network failure clears storage and leaves to the picker; test added. |
| Valkey `create` not atomic; CAS compares re-serialized JSON; CAS retry untested; pool scan reads all published questions | low | defer | See deferred-work.md; orphan expires with its 2 h TTL, CAS drift only affects live sessions at deploy. |
| Ratings tables and board keys not asserted unchanged | low | defer | Core has no ratings tables; test checks outbox, recent topics and key prefix. |
| `optionIndex` limited to 0 to 3 | false | rejected | The validator requires exactly four options. |
| Reports endpoint may not accept `SOLO` | false | rejected | Accepted since Story 3.5. |
| Practice strings outside `catalogue.ts` | false | rejected | Loaded with the lazy chunk; `check:i18n` and a new test cover both languages. |
| Lost answer response, retried Stop 404, stale tally on resume, orphan on early Stop, raw error bodies and similar | low | rejected | Cosmetic or narrow. |

## Design Notes

The unanswered `current` pointer is what makes `next` idempotent across reloads; `answered` is flipped in the same Valkey write that stores the counts, so a double tap yields 409 rather than a double count. Pool rebuild reuses the latest-`PUBLISHED` query, so a question published mid-session joins on the next cycle only. The existing live-match option list marks the correct option with volt; UX-DR3 forbids volt here, so the practice reveal uses the ink tile specified in the epic.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (in `web/`) -- expected: success, entry under 150 KB

**Manual checks (if no CLI):**
- At 320 px and 360 px with 200% text, in ml and en: long text wraps, no horizontal scroll, no volt visible.
