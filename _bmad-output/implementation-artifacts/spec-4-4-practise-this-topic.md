---
title: 'Story 4.4: Practise this topic'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '1756f491324487e9f80d0c760b583e2c771f8d88'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A registered player looking at a wrong answer in her results cannot go from that mistake to practising its topic; `MATCH_ENDED` questions do not carry a topic, and the breakdown row has no such action.

**Approach:** Carry an additive per-question `topicId` from core through `MATCH_ENDED`, and add a lazy-loaded "Practise this topic" link to the expanded breakdown row that starts Solo Practice (Story 4.3) on that topic. The epic's Story 4.4 acceptance criteria are the source of truth for every behavior below; they are not repeated here.

## Boundaries & Constraints

**Always:** `topicId` changes are additive and nullable; older stored `MATCH_ENDED` values still parse and simply hide the link. The link shows for a registered player, `questionSource: BANK`, non-null `topicId`, expanded rows only. The server stays the only judge of correctness and eligibility (`422`/`404` go to the picker notice). The entry chunk may not grow: all new web code and strings are lazy or offset byte-for-byte. Both `ml` and `en` strings.

**Never:** No change to `QuestionView`, `QUESTION_REVEALED`, rating or leaderboard logic, the live reveal, or the report link's behavior and hit area. No link for guests, `CUSTOM`, or a null topic. No new endpoint, no migration. No topic name on the wire (the name comes from the start response).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start ok | Registered, BANK, topic set, tap | POST solo session, PUT recent topic, store session for that topic, open `/practice/:topicId` | N/A |
| Too few / deleted | `422 topic-unavailable` or `404` | Picker (solo) with the small-topic notice, `['topics']` invalidated | No raw error shown |
| Transient | `5xx` or network | One-line inline error under the link with Retry, results intact | Link re-enabled |
| Offline | `navigator` offline | Link `aria-disabled` plus offline caption | Taps ignored |
| Pending | Request in flight | Link reads "…", further taps ignored | N/A |
| Hidden | Guest, `CUSTOM`, null `topicId`, old stored result, collapsed correct row, live reveal | No link | N/A |

</frozen-after-approval>

## Code Map

- `contracts/.../internal/InternalQuestion.java` -- add `topicId` (nullable UUID); about 10 game test constructors and `services/core/.../solo/application/SoloPracticeService.java` (l.210) call it, so a secondary constructor without it keeps them unchanged.
- `services/core/.../question/application/QuestionSetService.java` (`toInternal`, l.82) -- fill `topicId` from the served `QuestionVersion` (`topic_id` is on `question_version`); integration test asserts it for Quick and topic draws.
- `contracts/.../realtime/ResultQuestion.java`, `services/game/.../match/application/MatchOutcome.java` (`questionOf`, l.78) -- carry `topicId`; custom questions stay null.
- `contracts/src/test/.../RealtimeSamplesTest.java` and the `QuestionSetResponse` round-trip test -- cover with and without `topicId`.
- `web/src/realtime/protocol.ts` (`ResultQuestion`, `parseResultQuestion` l.511), `lastResult.ts` and `lastResult.test.ts` -- optional `topicId`; an entry without it must rehydrate.
- `web/src/screens/results/BreakdownRow.tsx` (`Details`) -- mount the link after `ReportQuestion`; `ResultsScreen.tsx` (l.198) passes the registered and played-as-guest decision (`ratedForHer` logic l.123-141); both are in the entry chunk.
- `web/src/report/ReportQuestion.tsx` -- `LINK` class and 48px hit target to copy; keep the two hit areas apart.
- New lazy `web/src/screens/results/PractiseLink.tsx` (loaded with `lazy()` from `BreakdownRow`) plus its own catalogue, following `screens/practice/practiceCatalogue.ts`.
- `web/src/screens/practice/practiceApi.ts` -- reuse `startPractice`, `PracticeError`, `saveStored` (session resume in `PracticeScreen.tsx` l.176 reads it, so no second start); `screens/topics/topicsApi.ts` l.50 PUT recent topic, `TOPICS_QUERY_KEY`.
- `web/src/screens/topics/TopicsRoutes.tsx` -- `PRACTICE_PATH`, solo picker `?for=solo&notice=small`; `ResultsScreen.tsx` l.303 shows the `cancelRematch()` call to mirror.
- `web/scripts/check-dist.mjs` (entry 149.6 of 150 KB), `check-i18n.mjs`, `check-tokens.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] contracts + core + game files above -- add `topicId` end to end -- AC 1
- [x] web `protocol.ts` / `lastResult.ts` -- parse optional `topicId` -- old results hide the action
- [x] `PractiseLink.tsx` + catalogue -- visibility rules, start flow, pending, error and offline states -- AC 2-6
- [x] `BreakdownRow.tsx` / `ResultsScreen.tsx` -- lazy mount and visibility props, with `cancelRematch()` before start -- AC 2, 4
- [x] tests -- one per I/O row, accessible name "Practise this topic, question 3", no live-reveal link, Back returns to rehydrated results

**Acceptance Criteria:**
- Given the entry chunk before and after, when `build:check` runs, then initial JS is at most 150 kB gzipped and the new link ships as a separate chunk.
- Given Quick Match and Topic Duel `MATCH_ENDED`, when they serialize, then each BANK question carries `topicId`.

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Nothing proves `MatchOutcome.questionOf` carries `topicId` into MATCH_ENDED | medium | patch | Fixed: `MatchTestKit.withTopic` and an assertion in `MatchActorTest`. |
| `ResultsScreen` wiring `practise={ratedForHer}` untested | medium | patch | Fixed: three cases (registered BANK, guest, CUSTOM). |
| Vacuous `getByTestId ?? getByTestId` assertion | low | patch | Fixed. |
| Retry succeeding after a failure untested | low | patch | Fixed. |
| Starting practice resets the stored tally; 409 on start has no branch; 404 shows the "small topic" notice | false | rejected | Start ends the old session (4.3); start has no 409; the spec routes 404 and 422 to the picker. |
| Rematch cancelled before a failed start, stale navigation after unmount, no error boundary on the lazy chunk, `topicId` shape validation, unlogged `markTopicUsed` failure, sign-off, naming | low | rejected | Cosmetic or narrow. |

## Design Notes

`BreakdownRow` is in the entry chunk with about 0.4 KB headroom, so it renders only a `lazy()` boundary plus props; the link, its strings and the start logic live in the new chunk. Rendering nothing for the Suspense fallback avoids layout shift. Start order: cancel rematch, POST, then `saveStored(topicId, ...)`, PUT recent topic (best effort, a failure never blocks), `navigate`. Core holds the per-question topic because game-service has no catalogue.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (in `web/`) -- expected: success, entry within budget
