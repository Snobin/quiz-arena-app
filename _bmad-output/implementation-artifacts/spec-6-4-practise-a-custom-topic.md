---
title: 'Story 6.4: Practise a custom topic'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: 'e019577b827ea8906bf324e3bf44a1078ba2ecc7'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A player can import and manage a custom topic (6.1 to 6.3), but Practice is a disabled stub: she cannot run Solo Practice on her own questions, and the picker only lists bank topics.

**Approach:** Replace the `422 custom source not available` placeholder in core's Solo Practice with a real `CUSTOM` source (owner-only, revision-aware), and add the web side: My topics in the solo picker, an enabled Practice action, and the Solo Practice screen on `/practice/custom/{customTopicId}`. The acceptance criteria in `_bmad-output/planning-artifacts/epics.md` "Story 6.4" are the source of truth, including every exact string and status code; this spec adds the code decisions below.

## Boundaries & Constraints

**Always:** `BANK` sessions behave exactly as before (Story 4.3 tests pass untouched). Ownership is enforced in the SQL (`owner_user_id` in the WHERE); a topic that is unknown, malformed or someone else's gives the same 404. A custom question's answer, explanation and correctness leave core only in the answer response (AD-5). A session stores `source.revision`; every `next` and `answers` compares it with the topic's current revision. Valkey sessions written before this story (no `revision`) must still deserialize. A custom session publishes no event, calls no service and touches no rating, match record or board. Question text goes in `textMl` when `lang` is `ml`, else `textEn`, never both.

**Never:** No Battle Room behaviour or `/internal/question-sets` change (6.5): "Use in Battle Room" stays disabled. No report link, source line or "Practise this topic" link on a custom question. No recent-topic write for a custom pick. No migration. Topic Duel callers still get `BANK` only. No endpoint that lists or counts other players' topics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start | Owner, topic with 1 to 500 questions | 201 `{sessionId, source{type CUSTOM, customTopicId, topicName}, poolSize}`; ids shuffled; stored `{CUSTOM, id, revision}` | not owner / unknown: 404; guest 403; `source.customTopicId` missing: 400 |
| Next | Open session, revision unchanged | Story 4.3 shape; `questionId` = `custom_question.id`, `version` = revision; no repeat in a cycle; 1-question topic repeats with `reshuffled: true` | N/A |
| Answer | Current question | Story 4.3 answer body, `attribution` always null | wrong current: 409 |
| Re-imported meanwhile | Stored revision != current | `answers`: 409 type `topic-changed`; `next`: rebuild pool from current questions, store the new revision, `reshuffled: true`, tally kept | N/A |
| Deleted meanwhile | Topic row gone | Every session call 404 type `topic-deleted` | N/A |
| Picker (solo) | Owns custom topics | "എന്റെ ടോപ്പിക്കുകൾ / My topics" above subjects, rows from the list endpoint, search filters them; none: section hidden; row routes to `/practice/custom/{id}` | list fails: section omitted, bank still usable |
| Practice screen | Custom session | Header: name and "സ്വന്തം" tag; question in its written language, no EN tag; explanation without source line or report link; title "Practice · <topic> · Minnal" | notice "This topic was updated. Starting again with its new questions." (polite, once) on changed; on deleted "This topic was deleted" with tally and "Choose another topic" |
| Guest | GUEST token or route | Server 403; route shows Sign-in prompt with `returnTo` | N/A |

</frozen-after-approval>

## Code Map

- `services/core/src/main/java/in/minnal/core/solo/application/SoloPracticeService.java` -- `start` placeholder to replace; `advance`, `rebuild`, `next`, `answer`, `topicOf`, `view` all assume a bank topic: branch on `source.type()` (small private strategy for BANK and CUSTOM question lookup), keep BANK code paths byte-for-byte equivalent
- `services/core/src/main/java/in/minnal/core/solo/application/SoloSession.java` -- `Source(type, topicId)` gains a nullable `Integer revision` (BANK null); add `Source.bank(id)` and `Source.custom(id, rev)`; `withCurrent` and `withAnswer` carry the source, so a rebuild needs a `withSource`
- `services/core/src/main/java/in/minnal/core/solo/application/SoloException.java` and `solo/api/SoloPracticeController.java` -- `SourceRequest` already has `topicId`: accept `customTopicId` (add field); add Kinds `TOPIC_CHANGED` (409, type `topic-changed`) and `TOPIC_DELETED` (404, type `topic-deleted`); `Errors` advice maps them; remove `CUSTOM_UNAVAILABLE` use
- `services/core/src/main/java/in/minnal/core/customtopic/application/CustomTopicRepository.java` and `infrastructure/JdbcCustomTopicRepository.java` -- add read-only `header(ownerId, topicId)` (name, revision, count), `questionIds(topicId)` and `question(topicId, questionId)`; `insertQuestions` shows ids are random per import, so a re-import changes every question id
- `services/core/src/test/java/in/minnal/core/solo/SoloPracticeIntegrationTest.java` -- line 110 expects the 422 placeholder: replace; helpers to reuse; `CustomTopicIntegrationTest.java` has `seedTopic`/`player`; `NoGuestResultEndpointTest.java` already lists the solo paths; `CustomTopicsStayInCoreTest` must still pass (solo is in core, so allowed)
- `web/src/screens/practice/practiceApi.ts`, `PracticeScreen.tsx`, `PracticeSummary.tsx`, `practiceCatalogue.ts` -- source-aware start; `PracticeError` gains kinds `changed` and `deleted`; screen takes a `source` prop; summary/end card needs a `deleted` kind; storage key already per id
- `web/src/screens/match/RevealDetails.tsx` -- always prints a source line: add a `hideSource` prop (default false, so match screens are untouched); `QuestionCard.tsx` already hides the EN tag with one language
- `web/src/screens/topics/TopicPicker.tsx`, `TopicsRoutes.tsx`, `topicPicker.test.tsx` -- `sources?: readonly TopicSource[]` is already in the props (unused): add `'CUSTOM'`, an `onSelectCustom` callback and the My topics section; routes add `/practice/custom/{uuid}` before the bank prefix match and pass `sources` only for `for=solo`
- `web/src/screens/customTopics/TopicViewScreen.tsx`, `importCatalogue.ts`, `manageApi.ts`, `manageFlow.test.tsx`, `importFlow.test.tsx` -- enable Practice (offline: disabled with the existing offline caption); Battle Room keeps its stub with a new Battle-only caption; `fetchTopicList` feeds the picker
- `web/scripts/check-dist.mjs` -- budget: nothing new may enter the entry chunk

## Tasks & Acceptance

**Execution:**
- [x] `core solo + customtopic repository` -- CUSTOM start, next, answer with the revision check, rebuild-on-change and deleted handling; BANK untouched -- ACs 1 to 4
- [x] `core controller and errors` -- accept `customTopicId`; the two new problem types; 404 parity -- ACs 1 and 4
- [x] `core tests` -- start (own, other's, unknown, 1-question, 0 questions, guest), serialization has no answer field, cycle and reshuffle, answer attribution null, ratings tables and board keys unchanged, re-import 409 and rebuild, delete 404, old-format session still loads, BANK suite untouched
- [x] `web practice` -- source-aware API, custom header and tag, no source line or report link, changed and deleted flows, resume and Practise again for custom, new strings in both languages (Malayalam flagged `signoff`)
- [x] `web picker, routes, topic view` -- My topics section and search, solo-only `sources`, custom route with guest redirect, enabled Practice action
- [x] `web tests` -- picker, practice (custom), topic view; update the tests that assume the disabled Practice stub

**Acceptance Criteria:**
- Given a topic owned by someone else or unknown, when any solo call names it, then the body equals the unknown-id 404.
- Given a custom session, when `next` is serialized, then no answer, explanation or correctness field is present.
- Given the build, when `npm run build:check` runs, then the custom practice code is not in the entry chunk and the budget holds.

## Implementation Notes

Implemented directly (no subagent). Core: `SoloSession.Source` gained a nullable `revision` (a 2-arg constructor keeps old callers and old Valkey sessions working); `SoloPracticeService` branches to `startCustom`, `nextCustom` and `answerCustom`, leaving the BANK code untouched. `nextCustom` rebuilds the pool when the stored revision differs (or the current question id is gone), keeping the tally. New Kinds `TOPIC_CHANGED` (409 `topic-changed`) and `TOPIC_DELETED` (404 `topic-deleted`); `CUSTOM_UNAVAILABLE` removed. `CustomTopicRepository` gained read-only `header`, `questionIds`, `question`. `SourceView` gained `customTopicId`. Web: `PracticeScreen` takes a `PracticeTarget`; `RevealDetails` gained `hideSource`; the picker's My topics section loads only when `sources` has `CUSTOM` (solo only); Practice is enabled on the topic view (offline: disabled), Battle Room keeps a stub with the new caption `import.success.soonBattle`, and `import.success.soon` was removed. New tests: `SoloCustomPracticeIntegrationTest` (7) and `customPractice.test.tsx` (8); the two older tests that expected the disabled Practice stub were updated.

## Spec Change Log

## Review Triage Log

Inline review by the implementer (not independent; no reviewer subagents were launched).

| Finding | Verdict | Evidence / route |
|---|---|---|
| A start for a topic that is foreign or gone shows "This topic was deleted" on the screen | low | accepted; the server answers the same 404 for both, and the picker only lists her own topics |
| `nextCustom` re-reads the header and a question per call (no cache) | low | accepted; one indexed read each, within the existing solo rate limits |
| Pre-6.4 Valkey sessions have no `revision` | medium | covered: a test loads a session without the field; BANK paths never read it |
| Playwright e2e not run | maybe-false | no e2e for custom practice exists yet; unit and integration tests cover the flows; CI runs the e2e suite |
| Two unrelated web tests (`ReportQuestion`, `LiveMatchRoom`) failed once in the full run | false | both pass alone, with and without this change; the handoff notes load-sensitive tests |

## Design Notes

Re-import deletes and reinserts questions, so every question id changes: the revision is the only reliable "same questions" signal, and it doubles as `QuestionView.version`. Answering after a re-import is a 409 on the revision, not a missing question; reads that miss a question id mid-session are treated as the same topic-changed case.

## Verification

**Commands:**
- `./mvnw -B verify -pl services/core -am` -- expected: BUILD SUCCESS (integration tests need Docker/podman; otherwise CI)
- `cd web && npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check && npm run e2e` -- expected: all pass
