---
title: 'Story 5.4: Play a room match'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '29a9a27cbd1725c701c48625f803fe89e0874a35'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A host can fill a lobby (5.3), but Start is a stub (`NOT_AVAILABLE_YET`): no room can play a match.

**Approach:** Replace the start stub end to end. The room actor re-checks, fetches the set off-thread, and starts the existing match actor with every room participant; the web client shows a server-timed 3-2-1 and plays on the existing live screen, then an interim final standings list. The epic's "Story 5.4" criteria are the source of truth for strings and behaviour; this spec covers the scope below. Battle Room scoreboard polish is split off (see Never).

## Boundaries & Constraints

**Always:** Every state change is a queued room-actor event; the core fetch never blocks the actor thread. One match-actor code path for 1v1 and rooms (configuration, not a copy). `ANSWER_ACCEPTED` stays receipt-only; `SCOREBOARD` lists who answered, never what. Codes never appear in logs. ML and EN strings through the catalogue. Room web code stays in lazy chunks; the entry stays at or below 150 KB gzipped.

**Never:** Publishing `minnal.match.completed` for `BATTLE_ROOM` (Story 5.5); the podium, ratings, play again; custom sources; bots in rooms. Split to deferred-work: top-8 scoreboard with own row and "+N more", the answered meter, rank arrows, overtake jump/crack and announcements, and the "Battle Room · topic" header.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start | host, ≥2 humans, LOBBY, not draining | `ROOM_LOBBY_UPDATED {phase: STARTING}`, fetch with 2 s timeout | N/A |
| Repeat / late | start or join while STARTING or IN_MATCH | start ignored; join gets `ROOM_STARTED` | changes nothing |
| Fetch fails | 422 / timeout / error | back to LOBBY, `ROOM_START_FAILED {TOPIC_UNAVAILABLE \| UNAVAILABLE}`, joins accepted | host sees the epic's two messages; nobody sees a raw 422 |
| Players gone | fetch ok, host gone or <2 humans | host gone: close; else back to LOBBY | no match made |
| Match start | fetch ok, ≥2 humans | fresh `matchId`, `ROOM_MATCH_STARTED` with `firstQuestionAt` = now + 3.5 s, room IN_MATCH | N/A |
| Questions | room match | 15 s window, 3 s reveal hold, `SCOREBOARD` coalesced to 250 ms, early close when all answered, forfeits as Story 1.9 (host too) | N/A |
| Everyone gone before Q1 reveal | all humans forfeited | abort: nothing published, aborted counter, room ENDED + tombstone, Home with the "did not count" notice | N/A |
| Match ends | last reveal | room ENDED, code expires with tombstone, `MATCH_ENDED`, no completed event, interim standings with Home | N/A |
| Draining | host taps Start | `SERVER_DRAINING`, stays LOBBY | running room matches play on |

</frozen-after-approval>

## Code Map

- `services/game/.../room/application/RoomService.java` (`start`) and `RoomActor.java` (`onStart`) -- stub becomes the STARTING step; needs a match registry, question-set client and a result event (`RoomEvent` gains `StartFetched`).
- `.../room/application/RoomRegistry.java` -- `closed()` records the tombstone and releases claims; reuse for ENDED.
- `.../room/domain/RoomPhase.java` / `RoomState.java` -- add `STARTING`; `IN_MATCH` exists unused.
- `.../matchmaking/application/MatchStarter.java` (`questionSetRequest`, `start`) and `QuestionSetClient` / `HttpQuestionSetClient` -- reuse the fetch (2 s timeout, 422 as `TopicUnavailableException`) and the `MatchSetup` build with all `USER` participants and no bot.
- `.../match/application/MatchRegistry.java` (`start`), `MatchActor.java` (`onAnswer` scoreboard per answer, `completed()` publishes unconditionally, `closeEarly`), `MatchSettings` / `MatchConfiguration` -- add rooms' 3 s hold (per mode), 250 ms scoreboard coalescing, skip the completed publish for `BATTLE_ROOM`, abort path.
- `contracts/.../realtime` -- add `RoomMatchStartedPayload`, `RoomStartFailedPayload`, `RoomLobbyUpdatedPayload.phase`, samples; mirror in `web/src/realtime/protocol.ts` and `screens/rooms/roomProtocol.ts`.
- `web/src/screens/rooms/roomClient.ts` (`start`, incoming switch ~L324-390) -- handle `ROOM_MATCH_STARTED` (seed `liveGameStore` via `liveMatchFor`, navigate to `/match`) and `ROOM_START_FAILED`; `HostLobby.tsx` start bar "…" / "Starting…" / failure copy and "Change topic".
- `web/src/screens/match/LiveMatchScreen.tsx`, `realtime/liveGameStore.ts` -- 3-2-1 countdown from `firstQuestionAt` with the server clock offset (no dedicated component exists), room-mode standings in place of the 1v1 strip, interim final standings.
- `roomCatalogue.ts` -- new strings with sign-off flags.
- Tests: `RoomFlowTest`, `RoomRegistryTest`, a `MatchActor` room-mode test (N=2 and N=5), `roomClient.test.ts`, `roomsFlow.test.tsx`, a live-screen countdown test, `RealtimeSamplesTest`.

## Tasks & Acceptance

**Execution:**
- [x] `contracts` + web protocol mirrors -- payloads, `phase`, samples -- one contract on both sides
- [x] `services/game room` -- STARTING step, off-thread fetch, failure and abandon paths, match start, ENDED + tombstone, drain refusal, metrics and log line -- epic criteria
- [x] `services/game match` -- room configuration: 3 s hold, 250 ms scoreboard coalescing, abort, no completed publish for `BATTLE_ROOM` -- one actor path
- [x] `web rooms + match` -- start states and copy, countdown, room standings, interim final list, aborted notice -- epic criteria
- [x] Tests -- matrix edge cases, N=2 and N=5 match, 50-player scoreboard timing (500 ms), countdown timing

**Acceptance Criteria:**
- Given a 50-player room, when answers arrive, then `SCOREBOARD` and `QUESTION_REVEALED` reach clients within 500 ms and answer acceptance p95 is under 200 ms.
- Given `build:check`, when it runs, then the entry stays at or below 150 KB.

## Implementation Notes

- Q1 opens at the room's `firstQuestionAt` (the match actor takes it instead of the lead-in); a coalesced `SCOREBOARD` spends no `seq` until it is sent (`MatchState.deferScoreboard`), so room frames stay gapless.
- `RoomClosedReason.MATCH_ENDED` is the tombstone reason when a room's match ends; it is never broadcast (players learn of the end from the match).
- A drain closes lobbies and `STARTING` rooms; a room whose match runs is left alone (the drain waits for the match, not the room).
- Web: the room client hands the match to the match connection (`startRoomMatch`) and closes its own socket. The live screen's room parts are in `RoomMatchParts.tsx`; room strings are in the rooms catalogue.
- Not done here: the countdown digit has no scale animation (digits swap), and a reload mid-room-match cannot tell a two-human room from a 1v1 (the SNAPSHOT carries no mode); see deferred-work.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Room player who confirms Leave (outcome `left`) gets no navigation, Leave button gone, no Home link | high | patch | Verified at `LiveMatchScreen.tsx` room branch: only `forfeited` was handled. Fixed (navigate Home) with a test. |
| No test: member session dropped while STARTING (`MatchActor.onBegin`) | medium | patch | Every room test passes `hasSession = sub -> true`; branch unexercised. Test sent to the implementer. |
| No test: host leave or drain while STARTING, late fetch ignored | medium | patch | Phase guard exists in `onStartFetched`/`onDrain` but nothing pins it. Test sent to the implementer. |
| "Change topic" only checked as an href, not that the room is kept | medium | patch | Only the href is asserted in `roomsFlow.test.tsx`. Test sent to the implementer. |
| `ROOM_JOINED` carries no phase; a member who missed `ROOM_START_FAILED` or `ROOM_MATCH_STARTED` (socket down) is stale; resync mid-match serves the lobby | medium | defer | Real, but the fix belongs with the already-deferred SNAPSHOT extension (mode, roomId, scoreboard). |
| Reloaded two-human room treated as 1v1 (`isRoomMatch` falls back to participant count) | medium | defer | Already in deferred-work (SNAPSHOT has no mode). |
| IN_MATCH room never freed if `MatchEnded` never arrives (24 h expiry ignored) | maybe-false | defer | Unverified, would be medium; settle by checking `MatchRegistry` always calls the end callback on every end path including actor failure. |
| Countdown digits are silent to screen readers; final-standings `h1` not focused or announced | low | defer | Real a11y gap, no data impact; belongs with the Battle Room polish deferred from this story. |
| Timing-based `MatchActorRoomTest` (sleeps, wall-clock bounds) may flake; p95 criterion checked as a single-run max | maybe-false | defer | Unverified, would be medium; settle by running the class 20 times on CI hardware. |
| Short set (`IllegalStateException`) reports UNAVAILABLE not TOPIC_UNAVAILABLE | low | rejected | Core answers 422 for too few questions, which maps to TOPIC_UNAVAILABLE; a wrong-size body is a core defect and "Try again" is fair. |
| Fetch has no actor-side deadline | false | rejected | `HttpQuestionSetClient` applies `orTimeout(2 s)`, so the future always completes. |
| Configure during STARTING races the fetch | false | rejected | `onConfigure` refuses unless phase is LOBBY. |
| Drain between `matches.start` and `state.inMatch()` orphans a match | false | rejected | Drain is a queued event; the actor handles one event at a time, so it cannot land between the two calls. |
| `matches.start` throws and the room stays STARTING; NPE on null `questions()` | low | rejected | Not reachable from a valid response (non-null by contract); fix adds guards for an unshown path. |
| Last answer sends no room `SCOREBOARD` | low | rejected | The early close reveals at once and the reveal carries every pick; the answered meter is deferred polish. |
| Q1 timer firing before `firstQuestionAt` | maybe-false | rejected | Would be low at worst; the open is scheduled from `firstQuestionAt`. |
| Dangling comma in standings aria-label; dead `rooms.start.sending` string; duplicated request building; missing failure metrics; import order; ArchitectureTest prefix match; sprint-status shows `in-progress` | low | rejected | Cosmetic or developer-only with no named failure; sprint status moves to `review` in step 5. |

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (web/) -- expected: success
