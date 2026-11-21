---
title: 'Story 5.3: Join a room and the live lobby'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: 'c4a1347aa75d673ee017b8f0cdc49721fcdf65c0'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A host can create and share a room (5.1, 5.2), but nobody can join it: `/app/room/join` is a stub, the Join field is inert, `/r/<code>` shows "arrives soon", and a non-host cannot leave.

**Approach:** Replace the join stub end to end: server join, non-host leave, tombstones, join rate limit, start checks and a coalesced lobby broadcast, then the web Join field, `/r/<code>` auto-join and the player lobby with chips. The epic's "Story 5.3" acceptance criteria (`planning-artifacts/epics.md`) are the source of truth for every behaviour, string and a11y rule; this spec adds only the code map and decisions. Start stays a stub (`NOT_AVAILABLE_YET`) until 5.4.

## Boundaries & Constraints

**Always:** Every state change is a queued room-actor event. Room web code stays in lazy chunks; the entry stays at or below 150 KB gzipped. One code normaliser per language, both driven by one shared fixture under `contracts/samples/`. Codes never appear in logs. No volt or flash in the lobby. ML and EN strings through the catalogue with sign-off flags.

**Never:** Start, play, podium or play-again (5.4 to 5.6); custom sources; bots in rooms; a guest joining before sign-in; REST for rooms.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Join | registered, live LOBBY room | private `ROOM_JOINED` role MEMBER, coalesced broadcast | N/A |
| Repeat join | `sub` already a member | `ROOM_JOINED` again, no second participant | N/A |
| Bad join | unknown / tombstoned / 50 full / started | `ROOM_NOT_FOUND` / `ROOM_EXPIRED` / `ROOM_FULL` / `ROOM_STARTED` | code kept in field |
| Busy | `sub` queued, in room or match | `ALREADY_IN_MATCH` with active id | notice with return button |
| Brute force | 11th failed lookup in a minute | `RATE_LIMITED` until the minute ends | successes never count |
| 60 joins at once | 50 slots | exactly 50 members, `seq` contiguous | 10 get `ROOM_FULL` |
| Start | non-host / host with 1 human / valid | `NOT_HOST` / `NOT_ENOUGH_PLAYERS` / `NOT_AVAILABLE_YET` | changes nothing |
| Host leaves | others present | confirm, `ROOM_CLOSED HOST_LEFT`, tombstone | players see notice |
| Link, guest | `/r/<code>` | Sign-in with `returnTo`, join after sign-in only | no join before sign-in |

</frozen-after-approval>

## Code Map

- `services/game/.../room/application/RoomService.java` -- `join` stub (l.85) becomes the gate (drain, guest, profile, busy, rate limit, lookup); `start` (l.105) gains `NOT_HOST` and `NOT_ENOUGH_PLAYERS` before the stub answer.
- `.../application/RoomRegistry.java` -- `findByCode` (l.141) unused today; add tombstones `{code, reason, until}` (24 h) checked by the code draw and by join, and the per-`sub` failed-lookup limiter; `closed()` (l.156) records the tombstone.
- `.../application/RoomActor.java` + `RoomEvent.java` -- add `Join`; `onLeave` (l.158) handles non-host leave; a 250 ms coalescing timer for `ROOM_LOBBY_UPDATED {joined, left, humanCount, participants}`; 50-member cap; member grace like the host's (l.168-190); resync returns a fresh `ROOM_JOINED`.
- `.../domain/RoomState.java`, `RoomCodes.java` -- members map gains add/remove; `normalize` (l.47) gets NFC and the spec's rules, plus a table-driven test from the shared fixture.
- `contracts/.../realtime/ErrorCode.java`, `RoomLobbyUpdatedPayload`, `contracts/samples/` -- add `ROOM_NOT_FOUND`, `ROOM_EXPIRED`, `ROOM_FULL`, `ROOM_STARTED`, `NOT_ENOUGH_PLAYERS`; `joined[]`/`left[]` fields; new samples (join request, errors); `code-normalisation.json` fixture. Mirror in `web/src/realtime/protocol.ts` and `screens/rooms/roomProtocol.ts`.
- `web/src/screens/rooms/roomCode.ts` -- `canonicalCode` (strips `[\s-]+`) adds NFC and the alphabet check; read the shared fixture in its test.
- `web/src/screens/rooms/roomClient.ts`, `RoomError.tsx` -- join send, `ROOM_*` error mapping, member leave, `ROOM_CLOSED HOST_LEFT` notice, lobby `seq` buffering and resync; reuse the existing seq dedupe (l.208).
- `web/src/screens/rooms/RoomsTab.tsx` (l.109-135) -- live Join field and button; `RoomsRoutes.tsx` -- `LobbyRoute` joins instead of "arrives soon", guest `returnTo`, errors back to the tab with the code prefilled.
- `web/src/screens/rooms/HostLobby.tsx` -- extract shared lobby parts; add `PlayerLobby` (read-only config, "Waiting for <host>"), `JoinedChips` (chip-pop, 24 cap, batch fade, reduced effects), host close confirm, start bar enable at 2+ humans.
- `web/src/screens/rooms/roomCatalogue.ts` -- strings and parity; `shell/announce.ts` for the 5 s debounced announcement.
- Tests: `RoomFlowTest.java`, `RoomRegistryTest.java`, `RoomCodesTest.java`, `RealtimeSamplesTest.java`, `roomsFlow.test.tsx`, `roomClient.test.ts`, `roomCode.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `contracts` + `web protocol` -- new error codes, payload fields, samples and shared normaliser fixture -- both sides agree on one contract
- [x] `services/game room` -- join, non-host leave, member grace, 50 cap, 250 ms coalescing, tombstones, rate limit, start checks, resync -- epic criteria
- [x] `web rooms` -- Join field, `/r/<code>` auto-join, player lobby, chips and announcements, host close confirm, start bar -- epic criteria
- [x] Tests -- normaliser table, 60-join load test with contiguous `seq`, error table, tombstone and limiter with a manual clock, chips under reduced effects, guest `returnTo` flow

**Acceptance Criteria:**
- Given the epic's Story 5.3 criteria, when built, then each passes at 320 px and at 360 px with 200% text.
- Given `build:check`, when it runs, then the entry stays at or below 150 KB with room code in separate chunks.

## Implementation Notes

- `ROOM_LOBBY_UPDATED` keeps `room` (with `participants[]` and `humanCount`) and adds `joined[]`/`left[]` as participant ids; a configure broadcasts at once and carries any joins/leaves still in the 250 ms window, so `seq` stays contiguous.
- Lobby `resync` is a new destination `/app/room/{roomId}/resync` (`Destinations.ROOM_RESYNC`), answered with a fresh private `ROOM_JOINED`.
- The joined role stays `MEMBER` (the 5.1 enum), as the I/O matrix says; the epic's "PLAYER" is read as that.
- The host's grace running out still closes with `HOST_DISCONNECTED` (5.1); a non-host client shows "<host> closed the room" for both `HOST_LEFT` and `HOST_DISCONNECTED`.
- The registry claims a joiner's `sub` before the actor decides and remembers every claim per room, so a join still queued when the room closes is released with the members.
- Failed lookups (no live room, a tombstone, or no valid code) count toward the limit; `ROOM_FULL`/`ROOM_STARTED` do not. Refused joins carry no `roomId`.
- 60 joins + the host are 61 humans for 50 places: the load test (`RoomRegistryTest`) sees 49 joiners admitted and 11 `ROOM_FULL` (the matrix's "10" counts the host among the 60).
- A link (`/r/<code>`) always sends the join, including the host's own reload (game-service answers a member with `ROOM_JOINED`), replacing the 5.2 resume-only path.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Drain clears `claims` before actors close, so members are never released | false | reject | The real drain (`closeAllForDrain`) sends `Drain` events and each actor closes through `closed()`, which releases the claims; `destroy()` is JVM teardown only. |
| A disconnect arriving before the queued `Join` is ignored, so the joiner is admitted with no grace timer | medium | patch | `onDisconnected` returns early for a non-member and `onJoin` never re-checks `hasSession`; a ghost chip stays until the room closes. |
| A second join with a different code returns the first join's promise | low | patch | `joining.promise` is returned whatever the code; a one-line code check fixes it. |
| `ROOM_EXPIRED` text formats the raw typed input, not the normalised code | low | patch | `formatCode(typed.trim())` leaves "k7m q2x" unformatted; use `normalizeCode`. |
| Deleted-sub and draining joins, and a configure that flushes pending joins, are untested | medium | patch | Verified: only create has those assertions; the configure case has no test. Tests added. |
| 60 joins: matrix says 10 `ROOM_FULL`, code and test give 11 | medium | human | The frozen matrix counts the host among the 60; the invariant (exactly 50 members) holds. Needs the human to correct the frozen row. |
| Web resync retry, join timeout and `LOST` notice untested | low | defer | Timer paths on top of tested happy paths. |
| A rematch is cleared when the actor then refuses the join (`ROOM_FULL`/`ROOM_STARTED`) | low | defer | Real but narrow; clear it from `onJoin` on success instead. |
| `NOT_ENOUGH_PLAYERS`/`NOT_HOST` show the generic start-failed caption | low | defer | Only reachable in a race (a player leaves as the host taps Start); Start is a stub until 5.4. |
| Close-confirm dialog has no focus trap or focus restore | medium | defer | Alertdialog, Stay focus and Esc are built per the epic; trap and restore belong with the shared dialog work. |
| Normaliser fixture lacks non-ASCII case-folding rows (`ſ`, Kelvin sign, zero-width) | low | defer | Java and JS agree on the rows present; widen once the Unicode behaviour is pinned. |
| No metric or log for the limiter or tombstones | low | defer | Observability only. |
| Ghost resync retries forever; comment says it gives up | low | defer | Ends on a socket drop; comment or cap to fix later. |
| Unrelated `ERROR` or `ROOM_CLOSED` can settle a pending join; late `ROOM_JOINED` can lower `lastSeq`; stale `startError`; join resolving after leaving the tab | low | rejected | Narrow races the server answers or the form already blocks (button ignores taps while joining). |
| Join button reads "…"; `start` on a missing room says `NOT_HOST`; sample carries the hyphenated code; chip expand is one-way; tombstone map pruning; resync joiners get no pop; claim re-add after a failed release | low | rejected | Spec-defined or matching 5.1 behaviour, cosmetic, or theoretical. |
| `ROOM_FULL`/`ROOM_STARTED` do not count toward the join limit | low | rejected | Spec: only failed lookups count; successful joins never count. |
| Sprint status and deferred-work bookkeeping | low | rejected | Sprint moves to review in step 5; the two deferred entries were requested by the split. |

## Design Notes

- The Java normaliser today strips only `-` and space while the web strips all whitespace; the shared fixture settles it on the epic's rule (NFC, spaces and hyphens stripped, upper-case).
- Member grace reuses the host's 10 s grace path in `RoomActor`, keyed by `sub`, so a dropped player stays listed and a reconnect within it gets `ROOM_JOINED`.
- Tombstones are in memory only, so after a restart every old code reads `ROOM_NOT_FOUND` (AD-14).

## Verification

**Commands:**
- `JAVA_HOME=$HOME/.jdks/openjdk-25.0.2 MAVEN_SKIP_RC=1 DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock TESTCONTAINERS_RYUK_DISABLED=true ./mvnw -q verify` (repo root) -- expected: success
- `npm run typecheck && npm test && npm run check:i18n && npm run check:tokens && npm run build:check` (web/) -- expected: success, entry within 150 KB

**Manual checks (if no CLI):**
- Join from a second device by code and by shared link; lobby with 50 long Malayalam and Latin names at 320 px.
