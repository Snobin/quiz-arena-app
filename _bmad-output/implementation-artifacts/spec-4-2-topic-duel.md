---
title: 'Story 4.2: Topic Duel'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'fed08cc841e7736793039abb7bc5580a686eab5a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Topic Duel is a "Coming soon" row and `/play/duel/:id` is a stub. game-service rejects `TOPIC_DUEL` joins with `MODE_UNAVAILABLE`, so Anju cannot train on one topic with a rating separate from Quick Match.

**Approach:** Build Story 4.2 exactly as its criteria in `epics.md` (section "Story 4.2: Topic Duel") describe: one matchmaking actor per `(TOPIC_DUEL, topicId)` reusing the Quick Match actor, a topic-filtered question set with an additive `topic` block, topic carried on `MATCH_FOUND`, `MATCH_ENDED`, `SNAPSHOT` and rematch, and the Duel screens, labels, notes and enabled Ranks button on top of the existing match, results and ratings flows.

## Boundaries & Constraints

**Always:** Pair only within the same `(mode, topicId)`; no copy of the pairing code. Ratings come from the in-memory cache for `TOPIC_DUEL`, never from the client. game-service never calls core to validate a topic before pairing (AD-2). Guests are rejected server-side for join and rematch whatever the UI shows. Core still returns exactly `count` questions or `422`; a `422` surfaces only as `TOPIC_UNAVAILABLE`, never raw. All new web code is lazy-loaded or offset byte-for-byte (entry gzip 149.1 of 150 KB). Strings in `ml` and `en`. No attribution lines in commits, PRs or code.

**Never:** No change to scoring, timers, forfeit, reconnect or the bot path. No ratings-service code or migration change (V1 already allows `TOPIC_DUEL`). No `topicId` in `minnal.match.completed`, no `topicId` metric tag, no per-topic boards, no Solo Practice work (4.3), no change to V1 to V9 or to Quick Match behaviour, payloads and ratings.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| Pair on topic | two registered players, same `topicId` | `MATCH_FOUND` with `mode: TOPIC_DUEL`, `topic`; 10 questions all on that topic | n/a |
| Different topics / Quick | queued on A and B, or on A and Quick | never paired with each other | bot fill at 8 s per queue |
| Bad topic id | no `topicId` or non-UUID | private `ERROR INVALID_TOPIC`, not queued, no claim held | n/a |
| Topic too small | core answers `422` | both get `MATCHMAKING_FAILED TOPIC_UNAVAILABLE`, picker reopens with notice and fresh catalogue | other failures keep the existing reason |
| Rematch, topic small | fresh fetch `422` | `MATCHMAKING_FAILED TOPIC_UNAVAILABLE`, one-line note and picker link on the button | n/a |
| Guest | `GUEST` token joins or rematches | private `ERROR FORBIDDEN_MODE` | n/a |
| Already busy | queued or in a match | `ALREADY_IN_MATCH`; draining gives `SERVER_DRAINING` | n/a |
| Idle actor | empty for 60 s | actor stopped; next join recreates it | n/a |

</frozen-after-approval>

## Code Map

- `contracts/.../realtime/{MatchFoundPayload,MatchEndedPayload,SnapshotPayload,MatchmakingFailedPayload,ErrorCode}.java` -- add `topic {topicId,name,subjectName}` (new `TopicInfo` record, null for Quick), `TOPIC_UNAVAILABLE` reason, `INVALID_TOPIC`; mirror in `web/src/realtime/protocol.ts` and its contract test.
- `contracts/.../internal/QuestionSetResponse.java` -- additive `topic? {topicId,name,subjectId,subjectName}`; JSON round-trip test beside `samples`.
- `services/core/.../question/application/QuestionSetService.java` -- fills `topic` when `filters.topicId` is set; reuse `JdbcSubjectTopicRepository`; unknown topic stays `QuestionSetUnavailableException` (422, `QuestionSetExceptionHandler`). Integration test asserts every question's topic.
- `services/game/.../matchmaking/application/MatchmakingService.java` -- `EnumMap<MatchMode, actor>` becomes a map keyed `(mode, topicId)`; `MODE_UNAVAILABLE` branch for `TOPIC_DUEL` removed; `join(...)` and the tick, cancel and disconnect fan-out use all actors; idle stop after 60 s; the controller `MatchmakingController` reads the join body for `topicId` (today it ignores it).
- `.../matchmaking/application/MatchmakingActor.java` -- takes `topicId`; `ratings.ratingOf(sub, mode)`; bot rating from that; `Activity.Queued(mode)` gains the topic so claim, release and cancel match.
- `.../matchmaking/application/RatingCache.java` -- `ratingOf(MinnalPrincipal)` is Quick only; add a mode overload (the `(userId, mode)` form exists; feeder `ValkeyRatingUpdateSource` already stores by mode).
- `.../matchmaking/application/MatchStarter.java` -- `questionSetRequest(requester, topicId)` with `filters.topicId`; `start` passes `topic` into `MATCH_FOUND` and `MatchSetup`; `failed` picks the reason.
- `.../matchmaking/infrastructure/HttpQuestionSetClient.java` -- today any 4xx is an opaque failure; map `422` to a typed `TopicUnavailable` failure.
- `.../matchmaking/application/RematchCoordinator.java` -- hard-codes `QUICK` (l.77, 189, 385, 403): carry mode and topic from `MatchSetup`, refetch the topic set, same guest rule.
- `.../match/domain/MatchSetup.java`, `match/application/MatchOutcome.java`, `MatchActor.java` -- hold the topic; add to `MATCH_ENDED` and `SNAPSHOT`; `MatchCompletedEvent` already carries `mode`, `BANK`, `rated`; unchanged.
- `.../match/application/MatchMetrics.java`, `MatchmakingActor` meters -- already tag `mode`; add `topicId` to the JSON log line only.
- `services/ratings/**` -- no change; add an end-to-end test (Topic Duel updates only `TOPIC_DUEL`, `QUICK` untouched).
- web `realtime/connection.ts` (l.935, 1028 hard-code `QUICK`), `liveGameStore.ts`, `protocol.ts` -- join and cancel by mode and topic; keep `topic` in store, snapshot and last result.
- web `screens/topics/TopicsRoutes.tsx` -- replace the Duel `Stub` with the matchmaking view; Cancel returns to the picker; `TOPIC_UNAVAILABLE` reopens it with the notice and an invalidated `['topics']`.
- web `screens/matchmaking/MatchmakingScreen.tsx`, `screens/match/QuestionCard.tsx` / `LiveMatchScreen.tsx`, `screens/results/{ResultsScreen,RematchCard}.tsx`, `ratings/MatchHistory.tsx`, `ranks/EmptyBoard.tsx` (the disabled button), `home/ComingSoonModeRows.tsx` -- topic name, mode label beside the EN tag, results heading accessible name, rematch note, mode "Topic Duel" in history, enabled Ranks button. These are in the entry chunk; checks `scripts/check-dist.mjs`, `check-i18n.mjs`, `check-tokens.mjs`.

## Tasks & Acceptance

**Execution:**
- [x] `contracts` -- add topic types, reason and error code, with round-trip tests -- shared wire shape first.
- [x] `services/core` -- topic block on the set response, with integration test -- source of the topic name.
- [x] `services/game` -- per-topic actors, 422 mapping, topic through match, snapshot and rematch, guest and busy rules, 60 s idle stop, tests with a controllable clock for pairing, widening, bot, isolation, invalid topic, rematch -- the engine work.
- [x] `services/ratings` (test only) -- Topic Duel end to end, Quick unchanged -- proves nothing needs to change.
- [x] `web` -- the screens listed in the Code Map, lazy where possible, with tests, ml and en strings, and the Ranks button -- player-facing surface.
- [x] Unit-test every I/O matrix row.

**Acceptance Criteria:** all criteria of Story 4.2 in `epics.md` (the section down to Story 4.3).

## Implementation Notes

## Spec Change Log

## Design Notes

- The epic says `reason: UNAVAILABLE` for other failures, but the code's constant is `QUESTION_SET_UNAVAILABLE`; keep the existing value and add `TOPIC_UNAVAILABLE`, so Quick Match payloads do not change.
- The topic name reaches `MATCH_FOUND` from core's `QuestionSetResponse.topic`, because game-service holds no catalogue; this is why the response gains the block.
- Web budget: entry has about 0.9 KB left. Prefer moving topic UI into the lazy `screens/topics/` chunk or a new lazy chunk; the shared match and results screens may add only a few bytes of topic plumbing.
- No migration is needed: core's next free version is V10 and nothing in this story needs it; game-service has no database; ratings V1 already admits `TOPIC_DUEL`.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root, all modules) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (in `web/`) -- expected: success, entry gzip within 150 KB

**Manual checks (if no CLI):**
- Two browsers on one topic reach a Topic Duel; the results show the topic and a Topic Duel delta, and the Quick rating is unchanged.
