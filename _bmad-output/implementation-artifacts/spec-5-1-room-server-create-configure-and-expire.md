---
title: 'Story 5.1: Room server: create, configure and expire'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '3b832b94260d2d6dad9e8a337cbcc9d673a84bb9'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** game-service has no Battle Room: nothing creates a room, makes a code, or lets a host configure and close one, so Stories 5.2 to 5.6 have nothing to build on.

**Approach:** Add an in-memory room actor and code registry in game-service plus the room contracts, all over STOMP, exactly as the criteria of Story 5.1 in `epics.md` say. No UI.

## Boundaries & Constraints

**Always:** Epic 5.1 criteria are the source of truth. Every lobby change is an event on the room actor's queue (AD-4). `roomId` is a fresh UUID. One `Activity` per `sub` (add `InRoom`). Reuse `Actor`, `ParticipationRegistry`, `DrainState`, `PlayerChannel`, `DeletedUsers`, `LastSessionClosed`, the injected `Clock`. Keep the `ErrorCode` order and existing values; only append. Codes never logged. Metrics tag `mode` only.

**Never:** No bot path in rooms (the room package must not reach `BotBrain`/bot factory; ArchUnit test). No core call from game-service, REST endpoint, Valkey key or migration. No join, start, scoreboard or match code (Stories 5.3, 5.4). No web UI, route or lazy chunk. Do not change Quick Match, Topic Duel, rematch or match-actor behaviour, `connection.ts` logic, or the web entry budget (135 of 150 KB gzipped).

**Decisions (human, 2026-11-21):** (1) Profile gate: core adds a `profileComplete` claim to the access token; game-service reads it for `PROFILE_REQUIRED`, and a token issued before this change lacks the claim and is treated as incomplete until it refreshes. This is the one core change the story allows (a claim in the token, no endpoint, key or migration). (2) Before Stories 5.3 and 5.5: host `leave` with other humans present, non-host `leave` and `playAgain` all answer `NOT_AVAILABLE_YET`. (3) Drain: a draining service closes open lobbies at once with `ROOM_CLOSED` reason `SERVER_DRAINING`; hosts re-create.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | Registered, profile done, idle, valid BANK source, count 5-30 | `ROOM_JOINED` (HOST), actor in `LOBBY` | N/A |
| Bad config | Count missing or out of range / non-UUID `topicId` / `CUSTOM` | `INVALID_ROOM_CONFIG` / `INVALID_TOPIC` / `SOURCE_NOT_AVAILABLE` | No room made |
| Forbidden | Guest / incomplete profile / deleted `sub` | `FORBIDDEN_MODE` / `PROFILE_REQUIRED` / refused as for matchmaking | Nothing changes |
| Busy | `sub` queued, in lobby or match | `ALREADY_IN_MATCH` with `matchId` or `roomId` | Nothing changes |
| Configure | Host / non-host | `ROOM_LOBBY_UPDATED` next `seq` / `NOT_HOST` | No change |
| Host leaves alone | Lobby with 1 human | Room closed, code and `sub` freed | N/A |
| Host drops | Last session closed | 10 s grace, then close; reconnect gets `ROOM_JOINED` | N/A |
| Expiry | Lobby at `expiresAt` | `ROOM_CLOSED {EXPIRED}`, code freed | N/A |
| Stubs | `join`, `start` | `NOT_AVAILABLE_YET` | No change |
| Collision | Seeded random repeats a live code | Redraw | N/A |

</frozen-after-approval>

## Code Map

- `contracts/.../realtime/{Destinations,MessageType,MatchMode,Participant,ParticipantKind,ErrorPayload,ErrorCode}.java` -- room destinations, `ROOM_*` types and `BATTLE_ROOM` already exist. Add payload records (`RoomJoinedPayload`, `RoomLobbyUpdatedPayload`, `RoomClosedPayload`+reason, `RoomSource` tagged), a `roomId` on `ErrorPayload` and `ServerMessage.error`, and codes `PROFILE_REQUIRED, INVALID_ROOM_CONFIG, SOURCE_NOT_AVAILABLE, NOT_HOST, NOT_AVAILABLE_YET`. Samples in `RealtimeSamplesTest`.
- `web/src/realtime/protocol.ts` (+ its contract test) -- add types and the error codes only; no runtime logic (entry budget).
- `services/game/.../platform/session/Activity.java` -- add `InRoom(roomId)`; `ParticipationRegistry` claim/release; `MatchmakingService` busy branch (l.186) must report a roomId.
- `services/game/.../matchmaking/application/MatchmakingService.java` -- the join gate (drain, guest, `DeletedUsers`, claim) is the pattern to copy; `MatchmakingController` shows `Principal` to `MinnalPrincipal` and lenient body parsing.
- New `services/game/.../room/{api,application,domain}`: `RoomController`, `RoomService` (gate), `RoomActor`, `RoomRegistry` (code to room), `RoomCodes` (injected `SecureRandom`), `RoomMetrics`.
- `platform/infrastructure/security/StompConnectAuthInterceptor.java` -- today denies `/topic/room/**`; allow it only for members of the live room (pattern: `MATCH_TOPIC` + `MatchAccess`). Broadcast through a new `RoomBroadcaster` beside `StompMatchBroadcaster`.
- `match/application/MatchDrain.java`, `platform/drain/DrainState.java` -- drain hooks; lobbies close at once on drain (decision 3).
- `services/core` token issuing (`UserTokenService` and its claims, `MinnalClaims`) -- add a boolean `profileComplete` claim computed when the access token is issued; game `MinnalPrincipal` and its token parsing read it. Decision 1.
- Tests: `support/{GameIntegrationTest,StompTestClient,MutableClock,FakeCore}`, `ArchitectureTest`. No migrations: core next free is V10, ratings V2, game has no database; none needed.

## Tasks & Acceptance

**Execution:**
- [x] `contracts/...` -- room payloads, error codes, `roomId` on errors, JSON round-trip tests -- criteria 1 of 5.1
- [x] `services/core` token claim `profileComplete` and game-side read, with tests (claim present, absent on an old token) -- decision 1
- [x] `web/src/realtime/protocol.ts` -- matching types and codes, contract test -- same
- [x] `room/domain` + `RoomCodes` -- state, config validation, alphabet, seeded collision test -- code criterion
- [x] `room/application` + `api` -- gate, actor, registry, expiry timer, host grace, stubs, drain -- remaining criteria
- [x] `StompConnectAuthInterceptor`, `Activity`, `MatchmakingService` -- member-only room topic, `InRoom` busy answer -- AD-11
- [x] Integration and unit tests for every I/O row; ArchUnit "room cannot reach bot" -- test rule from the matrix

**Acceptance Criteria:**
- Given a created room, when it closes by leave, grace or expiry, then its code is reusable and `live rooms` gauge falls.
- Given Quick Match or Topic Duel tests, when run unchanged, then they pass.
- Given a non-member session, when it subscribes to `/topic/room/{roomId}`, then the subscription is refused.

## Implementation Notes

- Room cap built as `minnal.room.max-live` (default 500; `MODE_UNAVAILABLE` beyond). Other settings: `minnal.room.ttl` (24h), `minnal.room.grace` (10s).
- Alphabet is the 31-character one from epics.md (A-Z and 2-9 without 0 O 1 I L). Room participant ids are random UUIDs, not the host's `sub` (the contract forbids exposing subs).
- Host reconnect: ROOM_JOINED is sent when the new session subscribes to `/user/queue/game` (sending at CONNECT would be lost); the grace cancels at CONNECT.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `profileComplete` claim verified only on hand-built accounts, not on real sign-in or refresh tokens | medium | patch | Fixed: integration test decodes the refreshed token before and after the profile is saved. |
| Production `ScheduledRoomTimers` never exercised (all tests use manual timers) | medium | patch | Fixed: new `ScheduledRoomTimersTest`. |
| `DrainState.onBegin` drops a listener registered after draining began | low | patch | Fixed: runs immediately when already draining; test added. |
| `RoomRegistry.closed` could leak a room and code if a release throws | low | patch | Fixed: maps cleared first, each release isolated; test added. |
| `RoomFlowTest` uses `Thread.sleep(100)` between subscribe and configure | low | patch | Fixed: polls until the frame arrives. |
| Non-member `leave`, start or playAgain on a room confirms the room exists or gives a different error | low | rejected | Room ids are random UUIDs only members learn; fix adds membership branches for an unlikely probe. |
| Configure after the room closed gets no reply, or `NOT_HOST` for a missing room | low | rejected | Client can rely on `ROOM_CLOSED`; the host sees the close. |
| Stale re-subscribe to a closed room's topic tears down the socket | low | rejected | Same behaviour as the match topic. |
| Config sanity bounds (`max-live`, `ttl`, `grace`), per-user create rate limit, topic name sanitising, grapheme-safe trim, code whitespace normalising, repeated `ROOM_JOINED`, unused variables, FQN import | low | rejected | Operator-controlled values or cosmetic; none shown to cause harm at this scale. |
| `topicName` is supplied by the host client and is shown to joiners | low | defer | Story 5.2 should take the name from core when the room is created, or validate it. |
| `hostParticipantId` is a random room participant id, not the host `sub` as the epic text says | low | defer | Deliberate (AD-10: a sub is never exposed); reconcile the epic wording. |
| Web has no runtime parsers or localisation for room messages | low | rejected | Out of scope: 5.1 adds types and codes only; the UI is later stories. |

## Design Notes

- Epic 4 lessons: reaping and per-key state must not leak (the 200-actor cap in `MatchmakingService` was added late). Rooms need a cap too, but the epic gives none: take `minnal.room.max-live` (default 500, `MODE_UNAVAILABLE` beyond), mention it in this spec when built. Review logs for 4.2 to 4.4 were lost once: confirm this file still holds the `## Review Triage Log` heading before commit.
- Timers go through a `RoomTimers` seam like `MatchTimers` so tests use `MutableClock`, not sleeps. Deferred work (l.46) wanted subscription authorisation; this story does it for rooms only.

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (in `web/`) -- expected: success, entry stays at or below 135 KB gzipped
