---
title: 'Story 5.5: Battle Room results and podium'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'f0cce60aef8b31a7eb2a021fd0be7628468f35ce'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A room match ends on a plain interim list (5.4), publishes no `minnal.match.completed`, so nobody is rated, and there is no podium.

**Approach:** Turn the Battle Room completion on end to end: `MATCH_ENDED` carries the room block and Ranking placements, exactly one completed event is published (rated, BANK), ratings-service rates it pairwise as built, and the web results screen shows the podium, full standings and the player's own place. The epic's "Story 5.5" criteria are the source of truth for strings and behaviour; this spec covers the scope below.

## Boundaries & Constraints

**Always:** One match-actor completion path for 1v1 and rooms. Placements come only from `contracts` `Ranking` (score desc, correct count desc, competition ranking); a forfeiter ranks on earned score in a room. Ratings formula and ratings-service code unchanged (pairwise, K = 32/(N-1), `BATTLE_ROOM` rating only). Podium and standings use names unchanged, tabular digits, and no reaction controls. Room web code stays in lazy chunks; the entry stays at or below 150 KB gzipped. ML and EN strings through the catalogue with sign-off flags.

**Never:** Play again (5.6), Share and the result card (Epic 7), custom sources, a rematch control. Split to deferred-work: the win and joint-win takeovers, the "Show my place" link, history rows showing "#3", the Ranks empty-board Rooms button, and the 50-player 320 px / 200% text audit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Room match completes | last reveal, ≥2 humans | `MATCH_ENDED` with placements, `room {roomId, hostParticipantId}`, `topic`; one `minnal.match.completed` {BATTLE_ROOM, roomId, BANK, rated true, `queueWaitMs` null, all USER}; match enters `POST_MATCH` for 60 s | N/A |
| Aborted room match | every human gone before Q1 reveal | nothing published | N/A |
| Ties | 3-way tie for first; tie for third; forfeiter in a 23-player field | shared placements 1,1,1,4 / 1,2,3,3,5 / forfeiter ranked on earned score | N/A |
| Rated end to end | 4-player room with a tie and a forfeiter | only `BATTLE_ROOM` rating moves, `match_record` rows written, `rating.updated` mode `BATTLE_ROOM`; WIN sole #1, DRAW shared #1, else LOSS | Quick Match and Topic Duel ratings untouched |
| Not #1 | placement 3 of 23 | settled view: compact ink band "#3 of 23", score, grey delta; podium and standings below | delta pending: "updating" after 10 s, no layout shift |
| Podium | 2 players / ties | columns 2-1-3 (only 2 and 1 with two players); tied entries share numeral and height, ordered by name for display | N/A |
| Standings | 50 players, forfeiters | every participant: placement, name, score, correct count; forfeiter muted "left" tag; own row tagged "നിങ്ങൾ"; compact band names her place | N/A |
| Reload on results | last `MATCH_ENDED` in sessionStorage | podium, standings and breakdown rehydrate | N/A |
| Home | any player | Home with the tab bar; leaves the post-match window | N/A |

</frozen-after-approval>

## Code Map

- `services/game/.../match/application/MatchActor.java` (`completed()`, the `mode != BATTLE_ROOM` publish guard ~L555) and `MatchOutcome.java` (`matchEnded()`, `completedEvent()`) -- remove the guard; add room block and `roomId`; add a 60 s `POST_MATCH` step after completion.
- `.../match/domain/MatchSetup.java` and `room/application/RoomActor.java` (`startMatch`, waits set to 0L) -- carry `roomId`; `queueWaitMs` must be null for rooms.
- `contracts/.../realtime/MatchEndedPayload.java` + samples -- additive `room {roomId, hostParticipantId}`; mirror in `web/src/realtime/protocol.ts`.
- `contracts/.../scoring/Ranking.java` + `RankingTest.java` -- reuse; add the three tie cases if missing.
- `services/ratings/.../ingest/MatchCompletedHandler.java` -- no code change; add a 4-player `BATTLE_ROOM` end-to-end test.
- `web/src/screens/results/ResultsScreen.tsx`, `outcome.ts`, `ResultsBand.tsx`, `BreakdownRow.tsx`, `DotStrip.tsx`, `RatingDelta.tsx`, `lastResult.ts`, `ratings/useMatchDelta.ts` -- reuse for band, delta (10 s retry), breakdown, report and Practise links, rehydrate; add a room variant ("#N of M", no 1v1 takeover).
- `web/src/screens/match/RoomMatchParts.tsx` (`RoomFinal`, interim) -- replaced by the new podium and standings; `LiveMatchScreen.tsx` hands off to `/results` for rooms.
- New `Podium` and `RoomStandings` components under `web/src/screens/results/`; strings in the rooms catalogue.
- Tests: `MatchActorRoomTest`, `RoomMatchFlowTest`, `RankingTest`, `MatchCompletedHandler` e2e, `ResultsScreen` room tests, `Podium` tests, `contract.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `contracts` + web protocol -- room block on `MATCH_ENDED`, samples, mirror -- one contract
- [x] `services/game match + room` -- completion publishes for `BATTLE_ROOM`, `roomId` plumbing, null `queueWaitMs`, `POST_MATCH` 60 s, abort still silent -- epic criteria
- [x] `services/ratings` -- 4-player `BATTLE_ROOM` e2e test -- pins the unchanged formula
- [x] `web results` -- podium, full standings, compact band, rating delta, breakdown links, rehydrate, Home; retire the interim list -- epic criteria
- [x] Tests -- matrix rows, `Ranking` ties

**Acceptance Criteria:**
- Given a completed room match, when it ends, then exactly one completed event exists and an aborted one publishes none.
- Given `build:check`, when it runs, then the entry stays at or below 150 KB.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `POST_MATCH` is only a 60 s longer tombstone; no actor state, nothing ends it on Home | medium | defer | Real deviation from the matrix wording, but the only consumer of a live window is Play again (5.6); the tombstone keeps the match resolvable for late traffic. Logged for 5.6; surfaced to the human at present. |
| `POST_MATCH_TTL` branch untested | medium | patch | No test references the constant; test sent to the implementer. |
| Room forfeiter's placement not checked through `MatchOutcome` | medium | patch | `RankingTest` calls `Ranking` with a literal `false`; the mode argument in `MatchOutcome` is unpinned. Test sent. |
| Forfeit then `MATCH_ENDED` navigation to `/results` untested | medium | patch | Effect has no test; the interim list it replaced is gone. Test sent. |
| Ratings e2e asserts only inequalities, not the formula | medium | patch | A wrong K would pass; exact deltas requested. |
| Podium tied-name order uses default-locale `localeCompare`, no stable tiebreak | low | patch | Direct one-line fix plus test; sent. |
| `hostParticipantId` null when the host is absent from `humans()` | false | rejected | `humans()` is built from `members`, which always holds the host; a host who leaves closes the room before start. |
| Aborted room match might publish; no test | false | rejected | `RoomMatchFlowTest` asserts `published.of(matchId)` is empty after the abort, and an aborted match never reaches `completed()`. |
| Four or more tied entries are cut from the podium by `slice(0,3)` | low | rejected | The epic says the podium shows the first three standings entries; ties share the numeral, and the full list shows everyone. |
| `room: null` rejected by the web parser | low | rejected | The server omits a null `room`; a sample test pins it. |
| Room with no `MATCH_ENDED` falls to the 1v1 minimal results | low | rejected | The actor sends `MATCH_ENDED` in the same `completed()` call; the minimal view is the existing fallback. |
| `navigate` missing from effect deps; duplicate `RoomStandings` names; aria-label string concatenation; guest prompt in rooms; escaped entities in aria labels; real 4 s `waitFor`; dead `hostParticipantId` on web; sample has empty breakdown; spec/sprint bookkeeping | low | rejected | Cosmetic or developer-only with no named failure; `hostParticipantId` is wired by Story 5.6; sprint status moves to `review` in step 5. |

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (web/) -- expected: success; if the full suite times out under load, re-run the failing files alone
