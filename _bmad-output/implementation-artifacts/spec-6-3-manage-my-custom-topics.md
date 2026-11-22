---
title: 'Story 6.3: Manage my custom topics'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '4c39750d6e60fe172765af27dcf7101459694aab'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A player can import a custom topic (6.1, 6.2) but cannot see their topics again, read the questions, replace them, or delete one, and the usage allowance is invisible until an import is refused.

**Approach:** Add the owner-only list, read, replace and delete endpoints in core, and the web screens for them: the topic list with a usage meter at `/me/custom-topics`, the topic view at `/me/custom-topics/{id}`, re-import mode on the Import screen at `/me/custom-topics/{id}/reimport`, and a delete confirmation. The acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 6.3" are the source of truth, including its exact strings; this spec adds the code decisions below.

## Boundaries & Constraints

**Always:** Reuse the Story 6.1 parse, validator, name and cap pipeline for replace (one code path; the topic's own current questions count as freed, its own name does not clash with itself) and the same row lock on `app_user`; a failed replace leaves the old name and questions untouched. A topic id that is unknown, malformed or someone else's returns the same 404 body (never 403). GET and DELETE are owner-scoped in the SQL itself (`owner_user_id` in the WHERE), PUT shares the `custom-import` token bucket with the refund-on-caller-mistake rule. The list and topic view are lazy (outside the initial bundle), strings are in a chunk-local catalogue in both languages with ML flagged for sign-off, and `check:i18n`, `check:tokens` and `build:check` pass. The usage meter is monochrome and exposes each cap as `role="meter"` with `aria-valuetext`. A just-imported topic lands on the topic view with the success card (carried as `?imported=1`).

**Never:** No Practice or Battle Room behaviour (6.4, 6.5): both actions stay disabled with the caption. No endpoint, in any service, that lists, searches, counts or ranks other players' topics; ratings and game code never read `custom_topic`. No migration (the tables from 6.1 already have `revision` and `updated_at`). No change to the bank catalogue, admin console or `/internal/question-sets`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List | Registered, 3 topics | 200 `{usage, topics[]}` newest `updatedAt` first, her topics only | guest 403, none 401 |
| Read | Own topic | 200 with ordered `questions[]` | other's or unknown id: identical 404 |
| Replace ok | Valid JSON, new or same name | 200 `{customTopicId, name, questionCount, revision+1, usage}`; old rows gone, `updated_at` set | N/A |
| Replace over cap | New count minus freed old count passes 500 | 422 `…/custom-topic-cap`, nothing changed | refund token |
| Replace fails | Syntax, field, name clash with another topic, DB error | Same error format as 6.1, old name and questions intact | 400 / 500 |
| Delete | Own topic | 204, rows gone (cascade) | already gone: 404, list refreshes |
| List screen | 0 topics | One plain line, meter at 0, Import topic, both disclosure rows expanded | N/A |
| List screen | 410 / 500 questions | Meter warning variant at 80% with headroom and way out | N/A |
| Topic view | 120 questions | First 50 shown, "Show 50 more" | N/A |
| Re-import | Prefilled name and current questions as JSON | Tally counts usage with old questions freed; "Copy JSON"; PUT; success returns to the topic view | Same error list |
| Delete dialog | Tap Delete | Alert dialog, focus on Cancel, Esc cancels; on success list with notice "'<topic>' deleted" | 404: just refresh |
| Failure / offline | 5xx or network | Skeleton rows while loading, inline error with detail and Retry; cached view stays readable offline with Import, Re-import and Delete `aria-disabled` | N/A |

</frozen-after-approval>

## Code Map

- `services/core/src/main/java/in/minnal/core/customtopic/application/CustomTopicService.java` -- `importTopic` is the pipeline to share: split its validation into a method returning the name and `Row`s, used by create and replace; `store` shows the lock, usage, name and cap order
- `services/core/src/main/java/in/minnal/core/customtopic/application/CustomTopicRepository.java` and `infrastructure/JdbcCustomTopicRepository.java` -- add list, find (with questions), replace, delete, and a name check that excludes one topic; `deleteAllForOwner` exists
- `services/core/src/main/java/in/minnal/core/customtopic/api/CustomTopicController.java` -- add GET list, GET `{id}`, PUT `{id}`, DELETE `{id}` beside POST and `/usage`; its `Errors` advice and `CustomTopicException` (add a not-found kind)
- `services/core/src/test/java/in/minnal/core/customtopic/api/CustomTopicIntegrationTest.java` -- helpers (`player`, `topic`, `send`, `seedTopic`) to extend; `identity/api/NoGuestResultEndpointTest.java` -- closed list of paths to extend; `NoEloOutsideRatingsTest.java` -- model for a source-scan architecture test (scan the game and ratings modules for `custom_topic`)
- `web/src/screens/customTopics/ImportScreen.tsx` -- add re-import mode (name and JSON prefill, PUT, tally with freed questions, "Copy JSON", title); success now navigates to the topic view; `SuccessCard.tsx`, `CustomTopicsRoutes.tsx` (route table, guest redirect), `importApi.ts` (add list, get, replace, delete), `Disclosures.tsx`, `LeaveDialog.tsx`, `importCatalogue.ts`
- `web/src/screens/home/CustomTopicsRow.tsx` -- change the target from Import to the list `/me/custom-topics` (and the guest `returnTo`)
- `web/src/screens/topics/TopicPicker.tsx` -- model for `useQuery` with a query key and Retry; `web/src/shell/router.ts` `searchParam`; `web/src/screens/customTopics/importFlow.test.tsx` -- tests that expect the old direct route and the success card with disabled actions must change
- `web/scripts/check-dist.mjs` -- budget and chunk rules

## Tasks & Acceptance

**Execution:**
- [x] Core repository and service -- list, read, replace (shared pipeline, freed-question cap math, self-excluding name check, revision and `updated_at`), delete
- [x] `CustomTopicController` -- the four endpoints, uniform 404, token bucket on PUT with refund
- [x] Core tests -- every matrix row incl. two-user 404 parity, replace atomicity on failure (a failure on the last of 500 questions keeps the old rows), concurrency with the lock, `NoGuestResultEndpointTest` path list, a source-scan test that game and ratings code never mention `custom_topic`
- [x] Web API client and queries -- list, get, replace, delete; invalidate the list, usage and topic after import, replace and delete
- [x] Web screens -- list with usage meter and rows and empty state, topic view with paged question cards and actions, re-import mode, delete dialog and notice, skeleton rows, error with Retry, offline states
- [x] `CustomTopicsRow`, routes, `SuccessCard` and catalogue -- list as the Me target; success lands on the view; all strings in both languages
- [x] Web tests -- flows for the matrix rows; update the 6.2 tests that assumed the direct Import route and the success card actions

**Acceptance Criteria:**
- Given a topic id owned by someone else, when any `/me/custom-topics/{id}` endpoint is called, then the body is identical to the unknown-id 404.
- Given a replace that fails for any reason, when core answers, then the topic's name, questions and `revision` are exactly as before.
- Given the build, when `npm run build:check` runs, then the new screens are not in the entry chunk and the budget holds.

## Implementation Notes

Implemented directly (no subagent). Core: `CustomTopicService` now shares one `prepare` pipeline between create and replace; replace runs under the same `app_user` lock, counts the topic's own questions as freed and ignores its own name; repository gained list, find (with questions), `nameExistsOther`, `updateTopic`, `deleteQuestions`, `delete`; new `CustomTopicException.notFound` gives the same 404 for unknown, malformed and foreign ids; PUT shares the `custom-import` bucket with refund. New source-scan test `CustomTopicsStayInCoreTest` (game and ratings never mention the tables; only the `customtopic` package and migrations do in core). Web: lazy routes `/me/custom-topics` (list), `/import`, `/{uuid}` (view) and `/{uuid}/reimport`; `UsageMeter`, `TopicListScreen`, `TopicViewScreen`, `DeleteDialog`; `ImportScreen` takes `topicId` for re-import (prefilled name and JSON, freed questions in the tally, "Copy JSON", PUT); the success card now lives on the topic view, carried as `?imported=1`; the Me row opens the list. All new strings are in `importCatalogue.ts` (ML flagged for sign-off). Initial JS unchanged at 134.3 KB. Core integration tests need Docker and first run in CI.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (not independent).

| Finding | Verdict | Evidence / route |
|---|---|---|
| Re-import wrote the untouched stored JSON as a draft, so a reload would restore stale questions | low | fixed (patch): the draft is cleared while the form equals the stored topic |
| `?imported=1` stays in the URL, so a reload shows the success card again | low | accepted; harmless |
| The deleted-topic notice reads its name from the URL | false | rendered as React text only |
| Replace does two reads of the topic (a precheck and one under the lock) | low | accepted; the second is the authoritative one |
| Core integration tests (replace, delete, 404 parity, caps) have not run locally | maybe-false | no Docker here; CI runs them |

## Verification

**Commands:**
- `./mvnw -B verify -pl services/core -am` -- expected: BUILD SUCCESS (integration tests need Docker; otherwise CI)
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check && npm run e2e` -- expected: all pass
